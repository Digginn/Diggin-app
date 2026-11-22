SET local check_function_bodies = off;

DROP FUNCTION "private"."create_comment"(bigint, text, uuid);

DROP FUNCTION "public"."create_comment"(bigint, text, uuid);

ALTER TABLE "private"."comments"
  ADD COLUMN "parent_id" bigint;

CREATE OR REPLACE FUNCTION private.community_comment_json (
  target_comment_id bigint
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'id', c.id::text, 'created_at', c.created_at,
    'content', case when c.author_id is null then null else c.content end,
    'is_post_author', c.author_id = p.author_id,
    'is_mine', c.author_id = (select auth.uid()), 'is_withdrawn', c.author_id is null,
    'anon_number', a.number, 'author_nickname', author.nickname,
    'is_operator', operator.id is not null,
    'vote_choice', vote.choice,
    'parent_id', c.parent_id::text
  ) from private.comments c join private.posts p on p.id = c.post_id
  left join public.profiles author on author.id = c.author_id
  left join private.post_anon_numbers a on a.post_id = c.post_id and a.user_id = c.author_id
  left join private.admin_users operator on operator.id = c.author_id and operator.disabled_at is null
  left join private.vote_responses vote on p.type = 'vote' and vote.post_id = c.post_id and vote.user_id = c.author_id
  where c.id = target_comment_id;
$function$;

CREATE OR REPLACE FUNCTION private.community_comment_listed (
  target_comment_id bigint
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from private.comments c
    left join private.comments parent on parent.id = c.parent_id
    where c.id = target_comment_id and c.deleted_at is null and c.hidden_at is null
      and private.community_author_visible(c.author_id) and private.community_content_visible('comment', c.id)
      and (c.parent_id is null or (parent.deleted_at is null and parent.hidden_at is null
        and private.community_author_visible(parent.author_id) and private.community_content_visible('comment', parent.id)))
  );
$function$;

CREATE OR REPLACE FUNCTION private.community_post_json (
  target_post_id bigint,
  is_preview     boolean
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select case when is_preview then jsonb_build_object(
    'id', p.id::text, 'type', p.type, 'created_at', p.created_at,
    'content', split_part(replace(p.content, E'\r', ''), E'\n', 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'position', i.position, 'image_url', i.image_url) order by i.position)
      from private.post_products i where i.post_id = p.id), '[]'::jsonb)
  ) else jsonb_build_object(
    'id', p.id::text, 'type', p.type, 'created_at', p.created_at, 'ends_at', p.ends_at,
    'server_now', now(), 'content', p.content, 'is_mine', p.author_id = (select auth.uid()),
    'author_nickname', author.nickname,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'position', i.position, 'name', i.name, 'brand', i.brand, 'price', i.price,
      'url', i.url, 'image_url', i.image_url) order by i.position)
      from private.post_products i where i.post_id = p.id), '[]'::jsonb),
    'like_count', (select count(*) from private.post_likes l where l.post_id = p.id),
    'is_liked', exists(select 1 from private.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
    'comment_count', (select count(*) from private.comments c where c.post_id = p.id
      and private.community_comment_listed(c.id)),
    'my_choice', (select v.choice from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid())),
    'buy_count', case when p.type = 'vote' and (p.author_id = (select auth.uid()) or p.ends_at <= now() or
      exists(select 1 from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid())))
      then (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'buy') else null end,
    'not_count', case when p.type = 'vote' and (p.author_id = (select auth.uid()) or p.ends_at <= now() or
      exists(select 1 from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid())))
      then (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'not') else null end
  ) end
  from private.posts p join public.profiles author on author.id = p.author_id
  where p.id = target_post_id;
$function$;

CREATE OR REPLACE FUNCTION private.create_comment (
  target_post_id    bigint,
  comment_content   text,
  request_id        uuid,
  parent_comment_id bigint DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target private.posts%rowtype;
  viewer_id uuid := (select auth.uid());
  existing private.comments%rowtype;
  parent private.comments%rowtype;
  clean_content text;
  anon_number integer;
  saved_id bigint;
begin
  -- 글 잠금을 먼저 잡아 원 댓글 삭제와 답글 등록을 줄 세운다.
  target := private.lock_community_post_for_write(target_post_id);
  if request_id is null then raise exception 'invalid_request_id' using errcode = '22023'; end if;
  select * into existing from private.comments where author_id = viewer_id and creation_request_id = request_id;
  if found then
    if existing.post_id <> target.id or existing.parent_id is distinct from parent_comment_id then
      raise exception 'invalid_request_id' using errcode = '22023';
    end if;
    if existing.deleted_at is not null or existing.hidden_at is not null then
      raise exception 'comment_not_found' using errcode = '42501';
    end if;
    return private.community_comment_json(existing.id);
  end if;
  if parent_comment_id is not null then
    select * into parent from private.comments where id = parent_comment_id and post_id = target.id;
    if not found or not private.community_comment_listed(parent.id) then
      raise exception 'comment_not_found' using errcode = '42501';
    end if;
    if parent.parent_id is not null then raise exception 'invalid_reply_target' using errcode = '22023'; end if;
  end if;
  clean_content := private.normalize_comment_content(comment_content);
  if viewer_id <> target.author_id then
    select number into anon_number from private.post_anon_numbers where post_id = target.id and user_id = viewer_id;
    if anon_number is null then
      update private.posts set next_anon_number = next_anon_number + 1 where id = target.id
      returning next_anon_number - 1 into anon_number;
      insert into private.post_anon_numbers(post_id, user_id, number) values (target.id, viewer_id, anon_number);
    end if;
  end if;
  insert into private.comments(post_id, parent_id, author_id, content, creation_request_id)
  values (target.id, parent_comment_id, viewer_id, clean_content, request_id) returning id into saved_id;
  return private.community_comment_json(saved_id);
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_community_comments (
  target_post_id   bigint,
  after_created_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id         bigint                   DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if private.get_community_post(target_post_id) is null then return '[]'::jsonb; end if;
  if (after_created_at is null) <> (after_id is null) then
    raise exception 'invalid_comment_cursor' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id::text, 'created_at', c.created_at,
      'content', case when c.author_id is null then null else c.content end,
      'is_post_author', c.author_id = p.author_id,
      'is_mine', c.author_id = (select auth.uid()), 'is_withdrawn', c.author_id is null,
      'anon_number', a.number, 'author_nickname', author.nickname,
      'is_operator', operator.id is not null,
      'vote_choice', vote.choice,
      'parent_id', null,
      -- 커서는 원 댓글 기준이라 답글은 원 댓글 안에 넣는다. 이전 앱은 replies를 무시한다.
      'replies', coalesce((select jsonb_agg(private.community_comment_json(r.id) order by r.created_at, r.id)
        from private.comments r where r.parent_id = c.id and private.community_comment_listed(r.id)), '[]'::jsonb)
    ) order by c.created_at, c.id), '[]'::jsonb)
    from (
      select c.* from private.comments c
      where c.post_id = target_post_id and c.parent_id is null and private.community_comment_listed(c.id)
        and (after_created_at is null or (c.created_at, c.id) > (after_created_at, after_id))
      order by c.created_at, c.id limit 20
    ) c
    join private.posts p on p.id = c.post_id
    left join public.profiles author on author.id = c.author_id
    left join private.post_anon_numbers a on a.post_id = c.post_id and a.user_id = c.author_id
    left join private.admin_users operator on operator.id = c.author_id and operator.disabled_at is null
    left join private.vote_responses vote on p.type = 'vote' and vote.post_id = c.post_id and vote.user_id = c.author_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_comment (
  target_post_id    bigint,
  comment_content   text,
  request_id        uuid,
  parent_comment_id bigint DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.create_comment(target_post_id, comment_content, request_id, parent_comment_id);
$function$;

REVOKE ALL ON FUNCTION "public"."create_comment"(bigint, text, uuid, bigint) FROM PUBLIC, "anon";

ALTER TABLE "private"."comments"
  ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES private.comments(id) ON DELETE CASCADE;

CREATE INDEX comments_parent_idx ON private.comments USING btree (parent_id, created_at, id)
  WHERE ((parent_id IS NOT NULL) AND (deleted_at IS NULL) AND (hidden_at IS NULL));

REVOKE ALL ON FUNCTION "private"."community_comment_listed"(bigint) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."create_comment"(bigint, text, uuid, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."create_comment"(bigint, text, uuid, bigint) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."create_comment"(bigint, text, uuid, bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."create_comment"(bigint, text, uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_comment"(bigint, text, uuid, bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_comment"(bigint, text, uuid, bigint) TO "service_role";
