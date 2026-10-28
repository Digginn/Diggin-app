create table public.import_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null,
  status public.import_status not null default 'processing',
  total_count integer not null check (total_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  result jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, request_id),
  unique (id, user_id),
  check (status <> 'completed' or total_count = success_count + failed_count + duplicate_count)
);

create table public.import_failures (
  id bigint generated always as identity primary key,
  job_id bigint not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  row_number integer not null check (row_number >= 2),
  product_name text,
  source_folder_name text,
  reason public.import_fail_reason not null,
  foreign key (job_id, user_id) references public.import_jobs (id, user_id) on delete cascade
);

create index import_failures_job_id_idx on public.import_failures (job_id);
create index import_failures_user_id_idx on public.import_failures (user_id);

alter table public.import_jobs enable row level security;
alter table public.import_failures enable row level security;
revoke all on table public.import_jobs, public.import_failures from anon, authenticated;
grant select on table public.import_jobs, public.import_failures to authenticated;
revoke all on sequence public.import_jobs_id_seq, public.import_failures_id_seq from anon, authenticated;

create policy "import_jobs_select_own" on public.import_jobs
for select to authenticated using ((select auth.uid()) = user_id);
create policy "import_failures_select_own" on public.import_failures
for select to authenticated using ((select auth.uid()) = user_id);

-- NOTICE는 COMMIT 전에도 전용 연결에 도착한다. 완료 신호는 Edge가 COMMIT 후 따로 보낸다.
create or replace function private.report_csv_import_progress(completed integer, total integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('diggin.csv_progress', true) = 'on'
    and completed > 0 and completed < total
    and completed % greatest(1, (total + 99) / 100) = 0 then
    raise notice 'csv_import_progress' using detail = jsonb_build_object('completed', completed, 'total', total)::text;
  end if;
end;
$$;
revoke execute on function private.report_csv_import_progress(integer, integer) from public, anon, authenticated;

-- 한 번의 Import를 원자적으로 저장한다. 응답을 잃은 재시도는 같은 request_id로 결과만 다시 읽는다.
create or replace function private.import_csv(request_id uuid, import_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.import_csv(request_id uuid, import_plan jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
set statement_timeout = '60s'
as $$ select private.import_csv(request_id, import_plan); $$;

revoke execute on function private.import_csv(uuid, jsonb) from public, anon;
revoke execute on function public.import_csv(uuid, jsonb) from public, anon;
grant execute on function private.import_csv(uuid, jsonb) to authenticated;
grant execute on function public.import_csv(uuid, jsonb) to authenticated;
