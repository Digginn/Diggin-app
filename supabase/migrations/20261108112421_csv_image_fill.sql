SET local check_function_bodies = off;

ALTER TABLE "public"."products"
  ADD COLUMN "image_checked_at" timestamp WITH time zone;

-- 기존 상품 중 CSV로 가져온 상품만 채우기 대상으로 남긴다. saved_at을 따로 넣는 경로는 import_csv뿐이라 링크·직접 입력 상품은 saved_at과 created_at이 같다.
UPDATE public.products SET image_checked_at = created_at WHERE saved_at = created_at;

CREATE OR REPLACE FUNCTION private.fill_product_image (
  target_product_id bigint,
  product_image_url text   DEFAULT NULL::text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := (select auth.uid());
  saved_url text;
begin
  perform private.assert_account_access();
  if viewer_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if product_image_url !~* '^https://' or char_length(product_image_url) > 2048 then
    raise exception 'invalid_image_url' using errcode = '22023';
  end if;
  update public.products
  set image_url = product_image_url, image_checked_at = now()
  where id = target_product_id and user_id = viewer_id and image_url is null and image_checked_at is null
  returning image_url into saved_url;
  if found then return saved_url; end if;
  select image_url into saved_url from public.products where id = target_product_id and user_id = viewer_id;
  if not found then
    raise exception 'product_not_found' using errcode = '42501';
  end if;
  return saved_url;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_product (
  product_url                text,
  product_name               text,
  product_brand              text              DEFAULT NULL::text,
  product_price              integer           DEFAULT NULL::integer,
  product_image_url          text              DEFAULT NULL::text,
  product_wish_level         public.wish_level DEFAULT NULL::public.wish_level,
  folder_ids                 bigint[]          DEFAULT NULL::bigint[],
  product_restriction_labels text[]            DEFAULT '{}'::text[]
)
  RETURNS TABLE (
    product_id   bigint,
    is_duplicate boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
  input_error text;
  saved_id bigint;
  is_owned boolean;
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  input_error := private.product_input_error(product_url, product_name, product_brand, product_price);
  if private.is_restricted_product(product_name, product_restriction_labels) then
    input_error := 'restricted_product';
  end if;
  if input_error is not null then
    raise exception '%', input_error using errcode = '22023';
  end if;

  select p.id into saved_id
  from public.products p
  where p.user_id = current_user_id and p.url = btrim(product_url);
  if saved_id is not null then
    return query select saved_id, true;
    return;
  end if;

  is_owned := exists (
    select 1 from public.folders f
    where f.id = any (coalesce(folder_ids, '{}')) and f.user_id = current_user_id and f.kind = 'owned'
  );

  insert into public.products (user_id, url, name, brand, price, image_url, image_checked_at, wish_level, restriction_labels)
  values (
    current_user_id,
    product_url,
    product_name,
    product_brand,
    product_price,
    product_image_url,
    now(),
    case when is_owned then null else product_wish_level end,
    coalesce(product_restriction_labels, '{}')
  )
  on conflict on constraint products_user_id_url_key do nothing
  returning id into saved_id;

  -- 같은 링크를 동시에 저장하면 먼저 들어간 상품을 돌려준다.
  if saved_id is null then
    select p.id into saved_id
    from public.products p
    where p.user_id = current_user_id and p.url = btrim(product_url);
    return query select saved_id, true;
    return;
  end if;

  insert into public.product_folders (product_id, folder_id, user_id)
  select saved_id, folder_id, current_user_id
  from unnest(coalesce(folder_ids, '{}')) as folder_id
  on conflict do nothing;

  return query select saved_id, false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fill_product_image (
  target_product_id bigint,
  product_image_url text   DEFAULT NULL::text
)
  RETURNS text
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.fill_product_image(target_product_id, product_image_url);
$function$;

REVOKE ALL ON FUNCTION "public"."fill_product_image"(bigint, text) FROM PUBLIC, "anon";

REVOKE ALL ON FUNCTION "private"."fill_product_image"(bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."fill_product_image"(bigint, text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."fill_product_image"(bigint, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."fill_product_image"(bigint, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."fill_product_image"(bigint, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."fill_product_image"(bigint, text) TO "service_role";
