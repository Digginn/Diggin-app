SET local check_function_bodies = off;

ALTER TABLE "private"."comments"
  ADD COLUMN "creation_request_id" uuid NOT NULL DEFAULT gen_random_uuid();

CREATE OR REPLACE FUNCTION private.agree_community_policy()
  RETURNS timestamp WITH time zone
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  agreed_at timestamptz;
begin
  perform private.assert_can_write_community();
  update public.profiles
  set community_policy_agreed_at = coalesce(community_policy_agreed_at, now())
  where id = (select auth.uid())
  returning community_policy_agreed_at into agreed_at;
  return agreed_at;
end;
$function$;

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
    'anon_number', a.number
  ) from private.comments c join private.posts p on p.id = c.post_id
  left join private.post_anon_numbers a on a.post_id = c.post_id and a.user_id = c.author_id
  where c.id = target_comment_id;
$function$;

CREATE OR REPLACE FUNCTION private.create_comment (
  target_post_id  bigint,
  comment_content text,
  request_id      uuid
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
  clean_content text;
  anon_number integer;
  saved_id bigint;
begin
  target := private.lock_community_post_for_write(target_post_id);
  if request_id is null then raise exception 'invalid_request_id' using errcode = '22023'; end if;
  select * into existing from private.comments where author_id = viewer_id and creation_request_id = request_id;
  if found then
    if existing.post_id <> target.id then raise exception 'invalid_request_id' using errcode = '22023'; end if;
    if existing.deleted_at is not null or existing.hidden_at is not null then
      raise exception 'comment_not_found' using errcode = '42501';
    end if;
    return private.community_comment_json(existing.id);
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
  insert into private.comments(post_id, author_id, content, creation_request_id)
  values (target.id, viewer_id, clean_content, request_id) returning id into saved_id;
  return private.community_comment_json(saved_id);
end;
$function$;

CREATE OR REPLACE FUNCTION private.create_post (
  post_kind    public.post_type,
  post_content text,
  product_ids  bigint[],
  request_id   uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := (select auth.uid());
  saved_id bigint;
  owned_count integer;
  item_count integer := coalesce(cardinality(product_ids), 0);
  normalized_content text := normalize(btrim(post_content), NFC);
  saved_at timestamptz := now();
begin
  perform private.assert_can_write_community();
  if request_id is null then
    raise exception 'invalid_request_id' using errcode = '22023';
  end if;
  -- 응답 유실 후 같은 초안을 재시도해도 글을 중복 생성하지 않는다.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(viewer_id::text || ':' || request_id::text, 0));
  select id into saved_id from private.posts
  where author_id = viewer_id and creation_request_id = request_id;
  if saved_id is not null then return saved_id::text; end if;

  if post_kind is null or normalized_content is null or
     private.char_count(regexp_replace(normalized_content, U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]', '', 'g')) not between 5 and 50 then
    raise exception 'invalid_post_content' using errcode = '22023';
  end if;
  if (post_kind = 'post' and item_count not between 1 and 4) or
     (post_kind = 'vote' and item_count <> 1) or
     item_count <> (select count(distinct id) from unnest(product_ids) as selected(id)) then
    raise exception 'invalid_post_products' using errcode = '22023';
  end if;
  if post_kind = 'post' and not exists (
    select 1 from public.profiles where id = viewer_id and community_policy_agreed_at is not null
  ) then
    raise exception 'community_policy_required' using errcode = '42501';
  end if;
  -- 복사 도중 원본을 수정·삭제하지 못하게 하며 잠금 순서는 상품 id로 고정한다.
  perform id from public.products
  where user_id = viewer_id and id = any(product_ids)
  order by id for share;
  get diagnostics owned_count = row_count;
  if owned_count <> item_count then
    raise exception 'invalid_post_products' using errcode = '22023';
  end if;

  insert into private.posts(author_id, type, content, created_at, ends_at, creation_request_id)
  values (viewer_id, post_kind, normalized_content, saved_at,
          case when post_kind = 'vote' then saved_at + interval '24 hours' end, request_id)
  returning id into saved_id;
  insert into private.post_products(post_id, position, name, brand, price, url, image_url)
  select saved_id, selected.position::smallint, p.name, p.brand, p.price, p.url, p.image_url
  from unnest(product_ids) with ordinality as selected(id, position)
  join public.products p on p.id = selected.id and p.user_id = viewer_id;
  return saved_id::text;
end;
$function$;

CREATE OR REPLACE FUNCTION private.delete_comment (
  target_comment_id bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  parent_id bigint;
begin
  perform private.assert_can_write_community();
  select post_id into parent_id from private.comments where id = target_comment_id and author_id = (select auth.uid());
  if not found then raise exception 'comment_not_found' using errcode = '42501'; end if;
  perform private.lock_community_post_for_write(parent_id);
  update private.comments set deleted_at = coalesce(deleted_at, now())
  where id = target_comment_id and author_id = (select auth.uid());
end;
$function$;

CREATE OR REPLACE FUNCTION private.delete_community_post (
  target_post_id bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := (select auth.uid());
  target private.posts%rowtype;
begin
  if viewer_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  -- 제재 중에도 본인 글 삭제는 허용한다. 타인 글 존재 여부는 공개하지 않는다.
  select * into target from private.posts where id = target_post_id and author_id = viewer_id for update;
  if not found then raise exception 'post_not_found' using errcode = '42501'; end if;
  if target.deleted_at is not null then return; end if;
  update private.posts set deleted_at = now() where id = target.id;
  update private.comments set deleted_at = now() where post_id = target.id and deleted_at is null;
  if target.type = 'vote' then delete from private.vote_responses where post_id = target.id; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.lock_community_post_for_write (
  target_post_id bigint
)
  RETURNS private.posts
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  target private.posts%rowtype;
begin
  perform private.assert_can_write_community();
  select * into target from private.posts where id = target_post_id for update;
  if not found or target.deleted_at is not null or target.hidden_at is not null or
     not private.community_author_visible(target.author_id) then
    raise exception 'post_not_found' using errcode = '42501';
  end if;
  return target;
end;
$function$;

CREATE OR REPLACE FUNCTION private.normalize_comment_content (
  comment_content text
)
  RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare
  clean_content text := normalize(replace(replace(comment_content, E'\r\n', E'\n'), E'\r', E'\n'), NFC);
begin
  if clean_content is null or private.char_count(clean_content) not between 1 and 30 or
     regexp_replace(clean_content, U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]', '', 'g') = '' then
    raise exception 'invalid_comment_content' using errcode = '22023';
  end if;
  return clean_content;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_community_like (
  target_post_id bigint,
  is_liked       boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target private.posts%rowtype;
begin
  target := private.lock_community_post_for_write(target_post_id);
  if target.type <> 'post' then raise exception 'invalid_post_type' using errcode = '22023'; end if;
  if is_liked is null then raise exception 'invalid_like_state' using errcode = '22023'; end if;
  if is_liked then
    insert into private.post_likes(post_id, user_id) values (target.id, (select auth.uid())) on conflict do nothing;
  else
    delete from private.post_likes where post_id = target.id and user_id = (select auth.uid());
  end if;
  return jsonb_build_object('is_liked', is_liked, 'like_count', (select count(*) from private.post_likes where post_id = target.id));
end;
$function$;

CREATE OR REPLACE FUNCTION private.update_comment (
  target_comment_id bigint,
  comment_content   text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  parent_id bigint;
  clean_content text;
begin
  perform private.assert_can_write_community();
  select post_id into parent_id from private.comments where id = target_comment_id and author_id = (select auth.uid());
  if not found then raise exception 'comment_not_found' using errcode = '42501'; end if;
  perform private.lock_community_post_for_write(parent_id);
  clean_content := private.normalize_comment_content(comment_content);
  update private.comments set content = clean_content, updated_at = now()
  where id = target_comment_id and author_id = (select auth.uid()) and deleted_at is null and hidden_at is null;
  if not found then raise exception 'comment_not_found' using errcode = '42501'; end if;
  return private.community_comment_json(target_comment_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.agree_community_policy()
  RETURNS timestamp WITH time zone
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.agree_community_policy();
$function$;

CREATE OR REPLACE FUNCTION public.create_comment (
  target_post_id  bigint,
  comment_content text,
  request_id      uuid
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.create_comment(target_post_id, comment_content, request_id);
$function$;

REVOKE ALL ON FUNCTION "public"."create_comment"(bigint, text, uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.create_post (
  post_kind    public.post_type,
  post_content text,
  product_ids  bigint[],
  request_id   uuid
)
  RETURNS text
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.create_post(post_kind, post_content, product_ids, request_id);
$function$;

CREATE OR REPLACE FUNCTION public.delete_comment (
  target_comment_id bigint
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.delete_comment(target_comment_id);
$function$;

REVOKE ALL ON FUNCTION "public"."delete_comment"(bigint) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.delete_community_post (
  target_post_id bigint
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.delete_community_post(target_post_id);
$function$;

CREATE OR REPLACE FUNCTION public.set_community_like (
  target_post_id bigint,
  is_liked       boolean
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.set_community_like(target_post_id, is_liked);
$function$;

REVOKE ALL ON FUNCTION "public"."set_community_like"(bigint, boolean) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.update_comment (
  target_comment_id bigint,
  comment_content   text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.update_comment(target_comment_id, comment_content);
$function$;

REVOKE ALL ON FUNCTION "public"."update_comment"(bigint, text) FROM PUBLIC, "anon";

ALTER TABLE "private"."comments"
  ADD CONSTRAINT "comments_author_request_key" UNIQUE (author_id, creation_request_id);

REVOKE ALL ON FUNCTION "private"."community_comment_json"(bigint) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."create_comment"(bigint, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."create_comment"(bigint, text, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."delete_comment"(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."delete_comment"(bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."lock_community_post_for_write"(bigint) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."normalize_comment_content"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."set_community_like"(bigint, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."set_community_like"(bigint, boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."update_comment"(bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."update_comment"(bigint, text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."create_comment"(bigint, text, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."create_comment"(bigint, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_comment"(bigint, text, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_comment"(bigint, text, uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."delete_comment"(bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."delete_comment"(bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_comment"(bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_comment"(bigint) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_community_like"(bigint, boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_community_like"(bigint, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_community_like"(bigint, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_community_like"(bigint, boolean) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_comment"(bigint, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."update_comment"(bigint, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_comment"(bigint, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_comment"(bigint, text) TO "service_role";
