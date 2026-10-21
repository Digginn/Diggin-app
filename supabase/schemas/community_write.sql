-- #95: 원본 테이블의 직접 쓰기는 열지 않고 아래 RPC만 허용한다.
create or replace function private.agree_community_policy()
returns timestamptz language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function private.create_post(
  post_kind public.post_type, post_content text, product_ids bigint[], request_id uuid
)
returns text language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function private.delete_community_post(target_post_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  viewer_id uuid := (select auth.uid());
  target private.posts%rowtype;
begin
  if viewer_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform private.assert_can_write_community();
  -- RPT-006: 기간 제한 중에는 본인 게시글 삭제도 차단한다.
  select * into target from private.posts where id = target_post_id and author_id = viewer_id for update;
  if not found then raise exception 'post_not_found' using errcode = '42501'; end if;
  if target.deleted_at is not null then return; end if;
  update private.posts set deleted_at = now() where id = target.id;
  update private.comments set deleted_at = now() where post_id = target.id and deleted_at is null;
  if target.type = 'vote' then delete from private.vote_responses where post_id = target.id; end if;
end;
$$;

create or replace function public.agree_community_policy()
returns timestamptz language sql security invoker set search_path = '' as $$
  select private.agree_community_policy();
$$;
create or replace function public.create_post(post_kind public.post_type, post_content text, product_ids bigint[], request_id uuid)
returns text language sql security invoker set search_path = '' as $$
  select private.create_post(post_kind, post_content, product_ids, request_id);
$$;
create or replace function public.delete_community_post(target_post_id bigint)
returns void language sql security invoker set search_path = '' as $$
  select private.delete_community_post(target_post_id);
$$;

revoke execute on function private.agree_community_policy(), public.agree_community_policy(),
 private.create_post(public.post_type, text, bigint[], uuid), public.create_post(public.post_type, text, bigint[], uuid),
 private.delete_community_post(bigint), public.delete_community_post(bigint) from public, anon;
grant execute on function private.agree_community_policy(), public.agree_community_policy(),
 private.create_post(public.post_type, text, bigint[], uuid), public.create_post(public.post_type, text, bigint[], uuid),
 private.delete_community_post(bigint), public.delete_community_post(bigint) to authenticated;
