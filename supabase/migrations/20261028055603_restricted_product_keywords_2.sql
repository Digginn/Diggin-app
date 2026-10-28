SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.import_csv (
  request_id  uuid,
  import_plan jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
  job_id bigint;
  saved_result jsonb;
  mapping jsonb;
  item jsonb;
  entry jsonb;
  source_name text;
  final_name text;
  stored_folder_name text;
  target_folder_id bigint;
  target_product_id bigint;
  folder_ids jsonb := '{}'::jsonb;
  existing_folder_ids jsonb;
  folder_errors jsonb := '{}'::jsonb;
  folder_warnings jsonb[] := '{}'::jsonb[];
  excluded jsonb[] := '{}'::jsonb[];
  total integer;
  imported integer := 0;
  duplicate_total integer := 0;
  failed_total integer := 0;
  price_value integer;
  saved_time timestamptz;
  input_error text;
  restriction_labels text[];
  failure_reason public.import_fail_reason;
  was_duplicate boolean;
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if import_plan->>'userId' is distinct from current_user_id::text then
    raise exception 'account_changed' using errcode = '42501';
  end if;
  if request_id is null or jsonb_typeof(import_plan) is distinct from 'object'
    or jsonb_typeof(import_plan->'products') is distinct from 'array'
    or jsonb_typeof(import_plan->'folderMappings') is distinct from 'array'
    or jsonb_typeof(import_plan->'failures') is distinct from 'array'
    or jsonb_typeof(import_plan->'duplicates') is distinct from 'array'
    or coalesce(import_plan->>'totalCount', '') !~ '^[0-9]{1,8}$' then
    raise exception 'invalid_import_plan' using errcode = '22023';
  end if;
  total := (import_plan->>'totalCount')::integer;
  if total <> jsonb_array_length(import_plan->'products')
    + jsonb_array_length(import_plan->'failures') + jsonb_array_length(import_plan->'duplicates') then
    raise exception 'invalid_import_plan' using errcode = '22023';
  end if;

  -- 일반 폴더 생성의 한도 트리거와 같은 행을 잠가 두 Import가 동시에 50개를 넘지 않게 한다.
  perform 1 from public.profiles where id = current_user_id for update;
  if not found then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select j.result into saved_result from public.import_jobs j
  where j.user_id = current_user_id and j.request_id = import_csv.request_id;
  if found then
    return saved_result;
  end if;
  -- 상품을 먼저, 폴더를 나중에 id 순으로 잠가 소장 처리와 교착하지 않게 한다.
  perform p.id from public.products p
  where p.user_id = current_user_id
    and p.url in (select value->>'url' from jsonb_array_elements(import_plan->'products'))
  order by p.id for update;
  perform f.id from public.folders f where f.user_id = current_user_id order by f.id for update;
  insert into public.import_jobs (user_id, request_id, total_count)
  values (current_user_id, request_id, total) returning id into job_id;
  select coalesce(jsonb_object_agg(f.name, f.id), '{}') into existing_folder_ids
  from public.folders f where f.user_id = current_user_id and f.kind = 'custom';

  for mapping in select value from jsonb_array_elements(import_plan->'folderMappings') loop
    source_name := mapping->>'sourceName';
    final_name := mapping->>'folderName';
    if source_name is null or btrim(source_name) = '' or source_name <> normalize(btrim(source_name), NFC)
      or final_name is null or final_name <> normalize(btrim(final_name), NFC)
      or private.char_count(final_name) not between 1 and 7 or final_name = '나의 소장템'
      or folder_ids ? source_name or folder_errors ? source_name then
      raise exception 'invalid_folder_mapping' using errcode = '22023';
    end if;
    -- 이전 Import에서 잘라 만든 이름보다 보존된 원본 버킷명을 먼저 확인한다.
    select f.id, f.name into target_folder_id, stored_folder_name from public.folders f
    where f.user_id = current_user_id and f.kind = 'custom' and f.csv_source_name = source_name;
    if found then
      if final_name <> stored_folder_name then
        raise exception 'csv_folder_conflict' using errcode = '40001';
      end if;
      folder_ids := folder_ids || jsonb_build_object(source_name, target_folder_id);
      continue;
    end if;
    if existing_folder_ids ? source_name then
      target_folder_id := (existing_folder_ids->>source_name)::bigint;
      if final_name <> source_name then
        raise exception 'csv_folder_conflict' using errcode = '40001';
      end if;
      folder_ids := folder_ids || jsonb_build_object(source_name, target_folder_id);
      continue;
    end if;
    -- 조회 뒤 다른 요청이 같은 후보 이름을 만들었으면 클라이언트가 최신 목록으로 다시 계산한다.
    if exists (select 1 from public.folders where user_id = current_user_id and name = final_name) then
      raise exception 'csv_folder_conflict' using errcode = '40001';
    end if;
    if (select count(*) from public.folders where user_id = current_user_id and kind = 'custom') >= 50 then
      folder_errors := folder_errors || jsonb_build_object(source_name, 'FOLDER_LIMIT_EXCEEDED');
      continue;
    end if;
    begin
      insert into public.folders (user_id, name, csv_source_name) values (current_user_id, final_name, source_name)
      returning id into target_folder_id;
      folder_ids := folder_ids || jsonb_build_object(source_name, target_folder_id);
    exception
      when unique_violation then
        raise exception 'csv_folder_conflict' using errcode = '40001';
      when check_violation then
        folder_errors := folder_errors || jsonb_build_object(source_name, 'FOLDER_SAVE_FAILED');
    end;
  end loop;

  for entry in select value from jsonb_array_elements(import_plan->'failures') loop
    perform private.report_csv_import_progress(imported + duplicate_total + failed_total, total);
    if coalesce(entry->>'rowNumber', '') !~ '^[0-9]{1,8}$' or (entry->>'rowNumber')::integer < 2
      or jsonb_typeof(entry->'productName') is distinct from 'string' or entry->>'reason' is null then
      raise exception 'invalid_import_plan' using errcode = '22023';
    end if;
    failure_reason := (entry->>'reason')::public.import_fail_reason;
    if failure_reason in ('FOLDER_LIMIT_EXCEEDED', 'FOLDER_SAVE_FAILED') then
      raise exception 'invalid_import_plan' using errcode = '22023';
    end if;
    insert into public.import_failures (job_id, user_id, row_number, product_name, reason)
    values (job_id, current_user_id, (entry->>'rowNumber')::integer, entry->>'productName', failure_reason);
    excluded := array_append(excluded, entry || jsonb_build_object('kind', 'failed'));
    failed_total := failed_total + 1;
  end loop;
  for entry in select value from jsonb_array_elements(import_plan->'duplicates') loop
    perform private.report_csv_import_progress(imported + duplicate_total + failed_total, total);
    if coalesce(entry->>'rowNumber', '') !~ '^[0-9]{1,8}$' or (entry->>'rowNumber')::integer < 2
      or jsonb_typeof(entry->'productName') is distinct from 'string' then
      raise exception 'invalid_import_plan' using errcode = '22023';
    end if;
    excluded := array_append(excluded, entry || jsonb_build_object('kind', 'duplicate', 'reason', 'DUPLICATE'));
    duplicate_total := duplicate_total + 1;
  end loop;

  for item in select value from jsonb_array_elements(import_plan->'products') loop
    perform private.report_csv_import_progress(imported + duplicate_total + failed_total, total);
    if coalesce(item->>'rowNumber', '') !~ '^[0-9]{1,8}$' or (item->>'rowNumber')::integer < 2
      or jsonb_typeof(item->'sourceFolderNames') is distinct from 'array'
      or jsonb_typeof(item->'isOwned') is distinct from 'boolean' then
      raise exception 'invalid_import_plan' using errcode = '22023';
    end if;
    -- 잘못된 선택 가격은 상품 행을 버리지 않는다. products의 integer 범위도 넘기지 않는다.
    price_value := null;
    if coalesce(item->>'price', '') ~ '^[0-9]{1,10}$' then
      if (item->>'price')::numeric <= 2147483647 then price_value := (item->>'price')::integer; end if;
    end if;
    input_error := private.product_input_error(item->>'url', item->>'name', item->>'brand', price_value);
    select coalesce(array_agg(value), '{}') into restriction_labels
      from jsonb_array_elements_text(coalesce(item->'restrictionLabels', '[]'::jsonb));
    if private.is_restricted_product(item->>'name', restriction_labels) then
      input_error := 'restricted_product';
    end if;
    if input_error is null and ((item->>'url') ~ '[[:space:]]'
      or (item->>'url') !~* '^https://[^/?#[:space:]]+') then input_error := 'invalid_url'; end if;
    begin
      saved_time := (item->>'savedAt')::timestamptz;
      if saved_time is null or not isfinite(saved_time) or saved_time > now() then
        input_error := 'invalid_date';
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      input_error := 'invalid_date';
    end;
    if input_error is not null then
      failure_reason := case input_error
        when 'invalid_url' then 'INVALID_PRODUCT_URL'::public.import_fail_reason
        when 'name_required' then 'EMPTY_PRODUCT_NAME'::public.import_fail_reason
        when 'restricted_product' then 'RESTRICTED_PRODUCT'::public.import_fail_reason
        else 'INVALID_PRODUCT_DATA'::public.import_fail_reason end;
      insert into public.import_failures (job_id, user_id, row_number, product_name, reason)
      values (job_id, current_user_id, (item->>'rowNumber')::integer, item->>'name', failure_reason);
      excluded := array_append(excluded, jsonb_build_object(
        'rowNumber', item->'rowNumber', 'productName', coalesce(item->>'name', ''), 'kind', 'failed', 'reason', failure_reason));
      failed_total := failed_total + 1;
      continue;
    end if;

    insert into public.products (user_id, url, name, brand, price, saved_at, restriction_labels)
    values (current_user_id, item->>'url', item->>'name', item->>'brand', price_value, saved_time, restriction_labels)
    on conflict on constraint products_user_id_url_key do nothing
    returning id into target_product_id;
    was_duplicate := target_product_id is null;
    if was_duplicate then
      select p.id into target_product_id from public.products p
      where p.user_id = current_user_id and p.url = item->>'url' for update;
      if not found then raise exception 'csv_product_conflict' using errcode = '40001'; end if;
      excluded := array_append(excluded, jsonb_build_object(
        'rowNumber', item->'rowNumber', 'productName', item->>'name', 'kind', 'duplicate', 'reason', 'DUPLICATE'));
      duplicate_total := duplicate_total + 1;
    else
      imported := imported + 1;
    end if;
    if (item->>'isOwned')::boolean then perform private.set_owned(target_product_id, true); end if;
    for source_name in select distinct value from jsonb_array_elements_text(item->'sourceFolderNames') loop
      if not (folder_ids ? source_name or folder_errors ? source_name) then
        raise exception 'invalid_folder_mapping' using errcode = '22023';
      end if;
      if folder_ids ? source_name then
        begin
          insert into public.product_folders (product_id, folder_id, user_id)
          values (target_product_id, (folder_ids->>source_name)::bigint, current_user_id)
          on conflict do nothing;
          continue;
        exception when foreign_key_violation then
          -- 일반 폴더가 동시에 삭제되어도 이미 저장한 상품은 ALL에 남긴다.
          failure_reason := 'FOLDER_SAVE_FAILED';
        end;
      else
        failure_reason := (folder_errors->>source_name)::public.import_fail_reason;
      end if;
      insert into public.import_failures (job_id, user_id, row_number, product_name, source_folder_name, reason)
      values (job_id, current_user_id, (item->>'rowNumber')::integer, item->>'name', source_name, failure_reason);
      folder_warnings := array_append(folder_warnings, jsonb_build_object(
        'rowNumber', item->'rowNumber', 'productName', item->>'name', 'sourceFolderName', source_name, 'reason', failure_reason));
    end loop;
  end loop;

  saved_result := jsonb_build_object('importedCount', imported, 'excludedProducts', excluded, 'folderFailures', folder_warnings);
  update public.import_jobs j set status = 'completed', success_count = imported, failed_count = failed_total,
    duplicate_count = duplicate_total, result = saved_result, finished_at = clock_timestamp()
  where j.id = job_id;
  return saved_result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.is_restricted_product (
  product_name text,
  labels       text[] DEFAULT '{}'::text[]
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from unnest(array[coalesce(product_name, '')] || coalesce(labels, '{}')) as source(value)
    cross join unnest(array[
      '성인','19','19금','19세','19+','18+','성인인증','청소년유해','청소년 구매불가','미성년자 구매불가',
      '술','주류','소주','맥주','와인','위스키','보드카','막걸리','사케','리큐르','칵테일',
      '담배','전자담배','니코틴','궐련','시가','vape','cigarette',
      '성인용품','섹스토이','섹스 토이','딜도','바이브레이터','자위기구','애널플러그',
      '성인영상','성인만화','성인잡지','adult','sex toy'
    ]) as keyword(value)
    where strpos(
      regexp_replace(lower(normalize(source.value, NFKC)), '[[:space:]]+', '', 'g'),
      regexp_replace(lower(normalize(keyword.value, NFKC)), '[[:space:]]+', '', 'g')
    ) > 0
  );
$function$;

CREATE OR REPLACE FUNCTION private.normalize_product()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.url := btrim(new.url);
  new.name := normalize(btrim(new.name), NFC);
  new.brand := nullif(normalize(btrim(new.brand), NFC), '');
  if private.is_restricted_product(new.name, new.restriction_labels) then
    raise exception 'restricted_product' using errcode = '22023';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.product_input_error (
  product_url   text,
  product_name  text,
  product_brand text,
  product_price integer
)
  RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare
  clean_name text := normalize(btrim(coalesce(product_name, '')), NFC);
  clean_brand text := normalize(btrim(coalesce(product_brand, '')), NFC);
begin
  if product_url is null or btrim(product_url) !~* '^https://' then
    return 'invalid_url';
  end if;
  if clean_name = '' then
    return 'name_required';
  end if;
  if private.is_restricted_product(clean_name) then
    return 'restricted_product';
  end if;
  if char_length(clean_name) > 100 then
    return 'name_too_long';
  end if;
  if char_length(clean_brand) > 30 then
    return 'brand_too_long';
  end if;
  if product_price < 0 then
    return 'invalid_price';
  end if;
  return null;
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

  insert into public.products (user_id, url, name, brand, price, image_url, wish_level, restriction_labels)
  values (
    current_user_id,
    product_url,
    product_name,
    product_brand,
    product_price,
    product_image_url,
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

CREATE OR REPLACE FUNCTION public.save_product (
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
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select * from private.save_product(
    product_url,
    product_name,
    product_brand,
    product_price,
    product_image_url,
    product_wish_level,
    folder_ids,
    product_restriction_labels
  );
$function$;

REVOKE ALL ON FUNCTION "public"."save_product"(text, text, text, integer, text, public.wish_level, bigint[], text[]) FROM PUBLIC, "anon";

CREATE TRIGGER products_normalize
  BEFORE INSERT OR UPDATE OF url, name, brand, restriction_labels ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION private.normalize_product();

REVOKE ALL ON FUNCTION "private"."is_restricted_product"(text, text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."is_restricted_product"(text, text[]) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."save_product"(text, text, text, integer, text, public.wish_level, bigint[], text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."save_product"(text, text, text, integer, text, public.wish_level, bigint[], text[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."save_product"(text, text, text, integer, text, public.wish_level, bigint[], text[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."save_product"(text, text, text, integer, text, public.wish_level, bigint[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_product"(text, text, text, integer, text, public.wish_level, bigint[], text[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_product"(text, text, text, integer, text, public.wish_level, bigint[], text[]) TO "service_role";
