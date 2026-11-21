-- 이용 기록 분석(Amplitude) 선택 동의(#156). 서비스 이용 기록 분석과 이용 기록의 국외 이전에 모두 동의한 회원만 수집한다.
-- 동의·철회할 때마다 항목·값·시각을 쌓고, 항목별 가장 최근 기록이 현재 상태다. 기록이 없으면 미동의다.
create table private.analytics_consent_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  item text not null check (item in ('usage_analysis', 'overseas_transfer')),
  is_agreed boolean not null,
  source text not null check (source in ('signup', 'login', 'settings', 'operator')),
  -- 이메일 철회 요청을 운영자가 처리한 기록만 남는다.
  admin_id uuid references private.admin_users (id),
  created_at timestamptz not null default now(),
  check ((source = 'operator') = (admin_id is not null))
);
create index analytics_consent_logs_user_item_idx
  on private.analytics_consent_logs (user_id, item, created_at desc, id desc);
create index analytics_consent_logs_admin_idx on private.analytics_consent_logs (admin_id);

-- 철회·탈퇴한 회원의 Amplitude 데이터 삭제 요청. 탈퇴 후에도 요청해야 해서 profiles와 연결하지 않는다.
create table private.amplitude_deletion_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  reason text not null check (reason in ('consent_withdrawn', 'account_deleted')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid,
  leased_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index amplitude_deletion_jobs_pending_user_idx
  on private.amplitude_deletion_jobs (user_id) where completed_at is null;
create index amplitude_deletion_jobs_due_idx
  on private.amplitude_deletion_jobs (available_at, id) where completed_at is null;

alter table private.analytics_consent_logs enable row level security;
alter table private.amplitude_deletion_jobs enable row level security;
revoke all on table private.analytics_consent_logs, private.amplitude_deletion_jobs
  from public, anon, authenticated, service_role;
revoke all on sequence private.analytics_consent_logs_id_seq, private.amplitude_deletion_jobs_id_seq
  from public, anon, authenticated, service_role;

create or replace function private.analytics_consent_state(target_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'usage_analysis', coalesce((
      select log.is_agreed from private.analytics_consent_logs as log
      where log.user_id = target_user and log.item = 'usage_analysis'
      order by log.created_at desc, log.id desc limit 1
    ), false),
    'overseas_transfer', coalesce((
      select log.is_agreed from private.analytics_consent_logs as log
      where log.user_id = target_user and log.item = 'overseas_transfer'
      order by log.created_at desc, log.id desc limit 1
    ), false)
  );
$$;

create or replace function private.analytics_fully_agreed(state jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (state ->> 'usage_analysis')::boolean and (state ->> 'overseas_transfer')::boolean;
$$;

-- 수집 중이던 회원만 삭제를 요청한다. 이미 대기 중인 요청이 있으면 그대로 둔다.
create or replace function private.enqueue_amplitude_deletion(target_user uuid, deletion_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.amplitude_deletion_jobs (user_id, reason)
  values (target_user, deletion_reason)
  on conflict (user_id) where completed_at is null do nothing;
$$;

-- 이전 상태와 값이 다르거나 기록이 없는 항목만 쌓는다. 가입 때 체크하지 않은 항목도 미동의로 남는다.
-- 기존 회원이 로그인 동의 화면에서 체크한 항목은 앱이 현재 상태와 합쳐 보내 체크하지 않았다고 철회되지 않는다.
create or replace function private.record_analytics_consent(
  target_user uuid, usage_analysis boolean, overseas_transfer boolean, consent_source text,
  actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous jsonb;
  next_state jsonb;
begin
  -- 같은 회원의 동시 변경을 줄 세워 철회 판정이 어긋나지 않게 한다.
  perform 1 from public.profiles where id = target_user for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  previous := private.analytics_consent_state(target_user);
  insert into private.analytics_consent_logs (user_id, item, is_agreed, source, admin_id)
  select target_user, change.item, change.is_agreed, consent_source, actor
  from (values ('usage_analysis', usage_analysis), ('overseas_transfer', overseas_transfer))
    as change (item, is_agreed)
  where not exists (
    select 1 from private.analytics_consent_logs as log
    where log.user_id = target_user and log.item = change.item
  ) or (previous ->> change.item)::boolean is distinct from change.is_agreed;
  next_state := private.analytics_consent_state(target_user);
  if private.analytics_fully_agreed(previous) and not private.analytics_fully_agreed(next_state) then
    perform private.enqueue_amplitude_deletion(target_user, 'consent_withdrawn');
  end if;
  return next_state;
end;
$$;

create or replace function private.get_analytics_consent()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := (select auth.uid());
begin
  perform private.assert_account_access();
  return private.analytics_consent_state(viewer_id);
end;
$$;

create or replace function private.set_analytics_consent(
  usage_analysis boolean, overseas_transfer boolean, consent_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := (select auth.uid());
begin
  perform private.assert_account_access();
  if usage_analysis is null or overseas_transfer is null or consent_source is null
    or consent_source not in ('signup', 'login', 'settings') then
    raise exception 'invalid_analytics_consent' using errcode = '22023';
  end if;
  return private.record_analytics_consent(viewer_id, usage_analysis, overseas_transfer, consent_source);
end;
$$;

-- 이메일 철회 요청. 운영자는 요청 메일 주소로 회원을 찾는다. 같은 이메일 계정이 둘 이상이면 고르지 않고 거부한다.
create or replace function private.admin_withdraw_analytics_consent(
  actor uuid, actor_session uuid, target_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  matches uuid[];
  state jsonb;
begin
  perform private.assert_moderator(actor, actor_session);
  if target_email is null or btrim(target_email) !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  select array_agg(account.id) into matches
  from auth.users as account
  join public.profiles as profile on profile.id = account.id
  where lower(account.email) = lower(btrim(target_email));
  if matches is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if cardinality(matches) > 1 then
    raise exception 'user_email_conflict' using errcode = 'P0001';
  end if;
  state := private.record_analytics_consent(matches[1], false, false, 'operator', actor);
  -- 이메일 철회는 동의 이력이 없는 이전 빌드 수집분도 지워야 해 항상 삭제를 요청한다.
  perform private.enqueue_amplitude_deletion(matches[1], 'consent_withdrawn');
  return jsonb_build_object('user_id', matches[1]) || state;
end;
$$;

-- 탈퇴·만 14세 미만 정리 모두 profiles를 지운다. 이전 빌드는 동의 이력 없이 수집했을 수 있어 모든 회원의 삭제를 요청한다.
-- 수집된 적 없는 회원 ID는 Amplitude가 무시한다(ignore_invalid_id).
create or replace function private.enqueue_amplitude_deletion_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_amplitude_deletion(old.id, 'account_deleted');
  return old;
end;
$$;
create trigger profiles_enqueue_amplitude_deletion before delete on public.profiles
for each row execute function private.enqueue_amplitude_deletion_on_profile_delete();

-- Amplitude 삭제 API는 한 번에 100명까지 받는다. HTTP 호출 동안 5분 lease로 중복 요청을 막는다.
create or replace function private.claim_amplitude_deletions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_id uuid := gen_random_uuid();
  user_ids jsonb;
begin
  with candidates as (
    select job.id from private.amplitude_deletion_jobs as job
    where job.completed_at is null and job.available_at <= now()
      and (job.leased_until is null or job.leased_until <= now())
    order by job.available_at, job.id limit 100 for update skip locked
  ), claimed as (
    update private.amplitude_deletion_jobs as job
    set lease_id = claim_id, leased_until = now() + interval '5 minutes', attempts = job.attempts + 1
    from candidates where job.id = candidates.id
    returning job.user_id
  )
  select coalesce(jsonb_agg(claimed.user_id::text), '[]'::jsonb) into user_ids from claimed;
  return jsonb_build_object('claim_id', claim_id, 'user_ids', user_ids);
end;
$$;

-- 실패하면 2분부터 두 배씩, 최대 6시간 간격으로 계속 다시 시도한다.
create or replace function private.finish_amplitude_deletions(claim_id uuid, succeeded boolean, error_code text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  finished integer;
begin
  if claim_id is null or succeeded is null then
    raise exception 'invalid_deletion_result' using errcode = '22023';
  end if;
  update private.amplitude_deletion_jobs as job set
    completed_at = case when succeeded then now() else null end,
    available_at = case when succeeded then job.available_at
      else now() + least(360, power(2, least(job.attempts, 9))) * interval '1 minute' end,
    last_error = case when succeeded then null else left(error_code, 80) end,
    lease_id = null, leased_until = null
  where job.lease_id = finish_amplitude_deletions.claim_id and job.leased_until > now();
  get diagnostics finished = row_count;
  return finished;
end;
$$;

create or replace function public.get_analytics_consent()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_analytics_consent();
$$;

create or replace function public.set_analytics_consent(
  usage_analysis boolean, overseas_transfer boolean, consent_source text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_analytics_consent(usage_analysis, overseas_transfer, consent_source);
$$;

create or replace function public.admin_withdraw_analytics_consent(
  actor uuid, actor_session uuid, target_email text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_withdraw_analytics_consent(actor, actor_session, target_email);
$$;

create or replace function public.claim_amplitude_deletions()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.claim_amplitude_deletions();
$$;

create or replace function public.finish_amplitude_deletions(claim_id uuid, succeeded boolean, error_code text default null)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.finish_amplitude_deletions(claim_id, succeeded, error_code);
$$;

revoke execute on function private.analytics_consent_state(uuid), private.analytics_fully_agreed(jsonb),
  private.enqueue_amplitude_deletion(uuid, text),
  private.record_analytics_consent(uuid, boolean, boolean, text, uuid),
  private.enqueue_amplitude_deletion_on_profile_delete()
  from public, anon, authenticated, service_role;
revoke execute on function private.get_analytics_consent(), public.get_analytics_consent(),
  private.set_analytics_consent(boolean, boolean, text), public.set_analytics_consent(boolean, boolean, text)
  from public, anon;
grant execute on function private.get_analytics_consent(), public.get_analytics_consent(),
  private.set_analytics_consent(boolean, boolean, text), public.set_analytics_consent(boolean, boolean, text)
  to authenticated;
revoke execute on function private.admin_withdraw_analytics_consent(uuid, uuid, text),
  public.admin_withdraw_analytics_consent(uuid, uuid, text),
  private.claim_amplitude_deletions(), public.claim_amplitude_deletions(),
  private.finish_amplitude_deletions(uuid, boolean, text), public.finish_amplitude_deletions(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function private.admin_withdraw_analytics_consent(uuid, uuid, text),
  public.admin_withdraw_analytics_consent(uuid, uuid, text),
  private.claim_amplitude_deletions(), public.claim_amplitude_deletions(),
  private.finish_amplitude_deletions(uuid, boolean, text), public.finish_amplitude_deletions(uuid, boolean, text)
  to service_role;

-- Vault 최초 설정은 배포 후 운영자가 한다. 설정 전에는 호출하지 않는다.
create or replace function private.invoke_amplitude_deletion()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  function_url text;
  deletion_secret text;
begin
  if not exists (
    select 1 from private.amplitude_deletion_jobs
    where completed_at is null and available_at <= now()
      and (leased_until is null or leased_until <= now())
  ) then return null; end if;
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'amplitude_deletion_url';
  select decrypted_secret into deletion_secret from vault.decrypted_secrets where name = 'amplitude_deletion_secret';
  if function_url is null or deletion_secret is null then return null; end if;
  return net.http_post(url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || deletion_secret),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
end;
$$;
revoke execute on function private.invoke_amplitude_deletion() from public, anon, authenticated, service_role;
select cron.schedule('amplitude-deletion-dispatch', '*/10 * * * *', 'select private.invoke_amplitude_deletion()');
-- 삭제 요청이 끝난 회원 ID는 Amplitude 처리 기간(최대 35일)이 지나면 지운다.
select cron.schedule('amplitude-deletion-cleanup', '40 18 * * *',
  $$delete from private.amplitude_deletion_jobs where completed_at < now() - interval '35 days'$$);
