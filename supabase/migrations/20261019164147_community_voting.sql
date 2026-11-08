SET local check_function_bodies = off;

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
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'position', i.position, 'name', i.name, 'brand', i.brand, 'price', i.price,
      'url', i.url, 'image_url', i.image_url) order by i.position)
      from private.post_products i where i.post_id = p.id), '[]'::jsonb),
    'like_count', (select count(*) from private.post_likes l where l.post_id = p.id),
    'is_liked', exists(select 1 from private.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
    'comment_count', (select count(*) from private.comments c where c.post_id = p.id
      and c.deleted_at is null and c.hidden_at is null and private.community_author_visible(c.author_id)),
    'my_choice', (select v.choice from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid())),
    'buy_count', case when p.type = 'vote' and (p.author_id = (select auth.uid()) or p.ends_at <= now() or
      exists(select 1 from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid())))
      then (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'buy') else null end,
    'not_count', case when p.type = 'vote' and (p.author_id = (select auth.uid()) or p.ends_at <= now() or
      exists(select 1 from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid())))
      then (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'not') else null end
  ) end
  from private.posts p where p.id = target_post_id;
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

CREATE OR REPLACE FUNCTION private.set_community_vote (
  target_post_id bigint,
  vote_option    text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target private.posts%rowtype;
  viewer_id uuid := (select auth.uid());
begin
  target := private.lock_community_post_for_write(target_post_id);
  if target.type <> 'vote' then raise exception 'invalid_post_type' using errcode = '22023'; end if;
  if vote_option is null or vote_option not in ('buy', 'not') then
    raise exception 'invalid_vote_choice' using errcode = '22023';
  end if;
  if target.author_id = viewer_id then raise exception 'own_vote' using errcode = '42501'; end if;
  -- now()는 트랜잭션 시작 시각이다. 잠금을 기다리다 마감된 요청도 거부해야 한다.
  if clock_timestamp() >= target.ends_at then raise exception 'vote_closed' using errcode = 'P0001'; end if;
  insert into private.vote_responses(post_id, user_id, choice)
  values (target.id, viewer_id, vote_option::public.vote_choice)
  on conflict (post_id, user_id) do update
    set choice = excluded.choice, updated_at = clock_timestamp()
    where private.vote_responses.choice <> excluded.choice;
  return private.community_post_json(target.id, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.agree_community_policy()
  RETURNS timestamp WITH time zone
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.agree_community_policy();
$function$;

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

CREATE OR REPLACE FUNCTION public.delete_community_post (
  target_post_id bigint
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.delete_community_post(target_post_id);
$function$;

CREATE OR REPLACE FUNCTION public.set_community_vote (
  target_post_id bigint,
  vote_option    text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.set_community_vote(target_post_id, vote_option);
$function$;

REVOKE ALL ON FUNCTION "public"."set_community_vote"(bigint, text) FROM PUBLIC, "anon";

REVOKE ALL ON FUNCTION "private"."set_community_vote"(bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."set_community_vote"(bigint, text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_community_vote"(bigint, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_community_vote"(bigint, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_community_vote"(bigint, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_community_vote"(bigint, text) TO "service_role";
