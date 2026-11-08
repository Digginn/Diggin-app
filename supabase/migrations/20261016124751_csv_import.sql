SET local check_function_bodies = off;

CREATE TABLE "public"."import_failures" (
  "id"                 bigint  GENERATED ALWAYS AS IDENTITY NOT NULL,
  "job_id"             bigint  NOT NULL,
  "user_id"            uuid    NOT NULL,
  "row_number"         integer NOT NULL,
  "product_name"       text,
  "source_folder_name" text,
  CONSTRAINT "import_failures_pkey" PRIMARY KEY (id),
  CONSTRAINT "import_failures_row_number_check" CHECK ((row_number >= 2))
);

ALTER TABLE "public"."import_failures"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."import_failures" FROM "anon";

CREATE TABLE "public"."import_jobs" (
  "id"              bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id"         uuid                     NOT NULL,
  "request_id"      uuid                     NOT NULL,
  "total_count"     integer                  NOT NULL,
  "success_count"   integer                  NOT NULL DEFAULT 0,
  "failed_count"    integer                  NOT NULL DEFAULT 0,
  "duplicate_count" integer                  NOT NULL DEFAULT 0,
  "result"          jsonb,
  "started_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at"     timestamp with time zone,
  CONSTRAINT "import_jobs_duplicate_count_check" CHECK ((duplicate_count >= 0)),
  CONSTRAINT "import_jobs_failed_count_check" CHECK ((failed_count >= 0)),
  CONSTRAINT "import_jobs_id_user_id_key" UNIQUE (id, user_id),
  CONSTRAINT "import_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "import_jobs_success_count_check" CHECK ((success_count >= 0)),
  CONSTRAINT "import_jobs_total_count_check" CHECK ((total_count >= 0)),
  CONSTRAINT "import_jobs_user_id_request_id_key" UNIQUE (user_id, request_id)
);

ALTER TABLE "public"."import_jobs"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."import_jobs" FROM "anon";

REVOKE ALL ON SEQUENCE "public"."import_failures_id_seq" FROM "anon";

REVOKE ALL ON SEQUENCE "public"."import_failures_id_seq" FROM "authenticated";

REVOKE ALL ON SEQUENCE "public"."import_jobs_id_seq" FROM "anon";

REVOKE ALL ON SEQUENCE "public"."import_jobs_id_seq" FROM "authenticated";

CREATE TYPE "public"."import_fail_reason" AS ENUM (
  'EMPTY_PRODUCT_NAME',
  'EMPTY_PRODUCT_URL',
  'INVALID_PRODUCT_URL',
  'CSV_ROW_PARSE_ERROR',
  'INVALID_PRODUCT_DATA',
  'FOLDER_LIMIT_EXCEEDED',
  'FOLDER_SAVE_FAILED'
);

ALTER TABLE "public"."import_failures"
  ADD COLUMN "reason" public.import_fail_reason NOT NULL;

CREATE TYPE "public"."import_status" AS ENUM (
  'processing',
  'completed',
  'failed'
);

ALTER TABLE "public"."import_jobs"
  ADD COLUMN "status" public.import_status NOT NULL DEFAULT 'processing'::public.import_status;

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
  failure_reason public.import_fail_reason;
  was_duplicate boolean;
begin
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
      insert into public.folders (user_id, name) values (current_user_id, final_name)
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
    if coalesce(entry->>'rowNumber', '') !~ '^[0-9]{1,8}$' or (entry->>'rowNumber')::integer < 2
      or jsonb_typeof(entry->'productName') is distinct from 'string' then
      raise exception 'invalid_import_plan' using errcode = '22023';
    end if;
    excluded := array_append(excluded, entry || jsonb_build_object('kind', 'duplicate', 'reason', 'DUPLICATE'));
    duplicate_total := duplicate_total + 1;
  end loop;

  for item in select value from jsonb_array_elements(import_plan->'products') loop
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
    if input_error is null and ((item->>'url') ~ '[[:space:]]'
      or (item->>'url') !~* '^https://[^/?#[:space:]]+') then input_error := 'invalid_url'; end if;
    begin
      saved_time := (item->>'savedAt')::timestamptz;
      if saved_time is null or not isfinite(saved_time) then input_error := 'invalid_date'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      input_error := 'invalid_date';
    end;
    if input_error is not null then
      failure_reason := case input_error
        when 'invalid_url' then 'INVALID_PRODUCT_URL'::public.import_fail_reason
        when 'name_required' then 'EMPTY_PRODUCT_NAME'::public.import_fail_reason
        else 'INVALID_PRODUCT_DATA'::public.import_fail_reason end;
      insert into public.import_failures (job_id, user_id, row_number, product_name, reason)
      values (job_id, current_user_id, (item->>'rowNumber')::integer, item->>'name', failure_reason);
      excluded := array_append(excluded, jsonb_build_object(
        'rowNumber', item->'rowNumber', 'productName', coalesce(item->>'name', ''), 'kind', 'failed', 'reason', failure_reason));
      failed_total := failed_total + 1;
      continue;
    end if;

    insert into public.products (user_id, url, name, brand, price, saved_at)
    values (current_user_id, item->>'url', item->>'name', item->>'brand', price_value, saved_time)
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

CREATE OR REPLACE FUNCTION public.import_csv (
  request_id  uuid,
  import_plan jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  SET statement_timeout TO '60s'
  AS $function$ select private.import_csv(request_id, import_plan); $function$;

REVOKE ALL ON FUNCTION "public"."import_csv"(uuid, jsonb) FROM PUBLIC, "anon";

ALTER TABLE "public"."import_failures"
  ADD CONSTRAINT "import_failures_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."import_jobs"
  ADD CONSTRAINT "import_jobs_check" CHECK (((status <> 'completed'::public.import_status) OR (total_count = ((success_count + failed_count) + duplicate_count))));

ALTER TABLE "public"."import_failures"
  ADD CONSTRAINT "import_failures_job_id_user_id_fkey" FOREIGN KEY (job_id, user_id) REFERENCES public.import_jobs(id, user_id) ON DELETE CASCADE;

ALTER TABLE "public"."import_jobs"
  ADD CONSTRAINT "import_jobs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX import_failures_job_id_idx ON public.import_failures USING btree (job_id);

CREATE INDEX import_failures_user_id_idx ON public.import_failures USING btree (user_id);

CREATE POLICY "import_failures_select_own" ON "public"."import_failures"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "import_jobs_select_own" ON "public"."import_jobs"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

REVOKE ALL ON FUNCTION "private"."import_csv"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."import_csv"(uuid, jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."import_csv"(uuid, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."import_csv"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."import_csv"(uuid, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."import_csv"(uuid, jsonb) TO "service_role";

REVOKE ALL ON SEQUENCE "public"."import_failures_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."import_failures_id_seq" TO "postgres";

REVOKE ALL ON SEQUENCE "public"."import_failures_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."import_failures_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE "public"."import_jobs_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."import_jobs_id_seq" TO "postgres";

REVOKE ALL ON SEQUENCE "public"."import_jobs_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."import_jobs_id_seq" TO "service_role";

REVOKE ALL ON TABLE "public"."import_failures" FROM "authenticated";

GRANT SELECT ON TABLE "public"."import_failures" TO "authenticated";

REVOKE ALL ON TABLE "public"."import_failures" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."import_failures" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."import_failures" TO "service_role";

REVOKE ALL ON TABLE "public"."import_jobs" FROM "authenticated";

GRANT SELECT ON TABLE "public"."import_jobs" TO "authenticated";

REVOKE ALL ON TABLE "public"."import_jobs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."import_jobs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."import_jobs" TO "service_role";
