-- #183: Generated declarative diff; unrelated pre-existing schema round-trip changes excluded.
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.contains_community_profanity (
  content text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with normalized as (
    select lower(regexp_replace(normalize(coalesce(content, ''), NFKC),
      U&'[\0009-\000D\0020\00A0\1680\2000-\200D\2028\2029\202F\205F\2060\3000\FEFF]', '', 'g')) as value
  )
  select exists (
    select 1 from normalized
    cross join private.nickname_banned_words banned
    cross join generate_series(1, char_length(value)) found(pos)
    where banned.kind = 'profanity'
      and substr(value, found.pos, char_length(banned.word)) = banned.word
      and not exists (
        select 1 from private.nickname_allowed_words allowed
        cross join generate_series(
          greatest(1, found.pos + char_length(banned.word) - char_length(allowed.word)),
          found.pos
        ) cover(pos)
        where substr(value, cover.pos, char_length(allowed.word)) = allowed.word
      )
  );
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
  if private.contains_community_profanity(normalized_content) then
    raise exception 'community_profanity' using errcode = '22023';
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

CREATE OR REPLACE FUNCTION private.normalize_comment_content (
  comment_content text
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  clean_content text := normalize(replace(replace(comment_content, E'\r\n', E'\n'), E'\r', E'\n'), NFC);
begin
  if clean_content is null or private.char_count(clean_content) not between 1 and 30 or
     regexp_replace(clean_content, U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]', '', 'g') = '' then
    raise exception 'invalid_comment_content' using errcode = '22023';
  end if;
  if private.contains_community_profanity(clean_content) then
    raise exception 'community_profanity' using errcode = '22023';
  end if;
  return clean_content;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."contains_community_profanity"(text) FROM PUBLIC;
