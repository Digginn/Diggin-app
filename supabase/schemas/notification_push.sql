-- 기기별 상태를 남겨 일부 기기만 실패해도 성공한 기기에 다시 보내지 않는다.
create table private.notification_push_deliveries (
  id bigint generated always as identity primary key,
  notification_id bigint not null references private.notifications(id) on delete cascade,
  token_id bigint not null references public.push_tokens(id) on delete cascade,
  token_updated_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending','receipt','delivered','failed','skipped')),
  ticket_id text,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid,
  leased_until timestamptz,
  last_error text,
  unique (notification_id, token_id)
);
create index notification_push_due_idx on private.notification_push_deliveries(available_at, id)
  where state in ('pending','receipt');
create index notification_push_token_idx on private.notification_push_deliveries(token_id);
alter table private.notification_push_deliveries enable row level security;
revoke all on private.notification_push_deliveries from public, anon, authenticated, service_role;
revoke all on sequence private.notification_push_deliveries_id_seq from public, anon, authenticated, service_role;

create or replace function private.push_notification_allowed(notification_id bigint, token_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.notifications n
    join private.posts p on p.id = n.post_id
    join public.profiles u on u.id = n.recipient_id
    join public.push_tokens t on t.id = token_id and t.user_id = n.recipient_id
    left join private.notification_settings s on s.user_id = n.recipient_id
    where n.id = notification_id and n.created_at > now() - interval '24 hours'
      and u.status <> 'suspended' and coalesce(s.push_enabled, true)
      and p.deleted_at is null and p.hidden_at is null
      and (n.actor_id is null or private.notification_actor_visible(n.recipient_id, n.actor_id))
  );
$$;

-- 신규 알림만 넣는다. 기능 배포 이전 알림이나 토큰 등록 이전 알림은 나중에 몰아서 보내지 않는다.
create or replace function private.enqueue_notification_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.notification_push_deliveries(notification_id, token_id, token_updated_at)
  select new.id, t.id, t.updated_at from public.push_tokens t
  where t.user_id = new.recipient_id
    and t.token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'
    and private.push_notification_allowed(new.id, t.id)
  on conflict do nothing;
  return new;
end;
$$;
create trigger notifications_enqueue_push after insert on private.notifications
for each row execute function private.enqueue_notification_push();

-- RPC 한 트랜잭션 안에서 선점하고 HTTP 호출 동안 5분 lease로 중복 작업을 막는다.
create or replace function private.claim_notification_pushes(receipts boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  jobs jsonb;
begin
  with candidates as (
    select d.id from private.notification_push_deliveries d
    where d.state = case when receipts then 'receipt' else 'pending' end
      and d.available_at <= now() and (d.leased_until is null or d.leased_until <= now())
    order by d.available_at, d.id limit 100 for update skip locked
  ), claimed as (
    update private.notification_push_deliveries d
    set lease_id = gen_random_uuid(), leased_until = now() + interval '5 minutes', attempts = attempts + 1
    from candidates c where d.id = c.id returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id::text, 'lease_id', d.lease_id, 'ticket_id', d.ticket_id,
    'allowed', private.push_notification_allowed(n.id, t.id),
    'expired', n.created_at <= now() - interval '24 hours',
    'token', t.token, 'recipient_id', n.recipient_id, 'post_id', p.id::text, 'post_type', p.type,
    'title', case when n.type = 'vote_ended' then '투표가 종료됐어요.' else n.title end,
    'body', case when n.type = 'vote_ended' then '내 투표 결과를 확인해 보세요.'
      when n.type = 'post_liked' then private.notification_text(p.content) else n.body end
  ) order by d.id), '[]'::jsonb) into jobs
  from claimed d join private.notifications n on n.id = d.notification_id
  join private.posts p on p.id = n.post_id join public.push_tokens t on t.id = d.token_id;
  return jobs;
end;
$$;

create or replace function private.finish_notification_push(
  delivery_id bigint, claim_id uuid, outcome text, ticket text default null, error_code text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  job private.notification_push_deliveries%rowtype;
begin
  if outcome not in ('accepted','delivered','retry','receipt_retry','failed','unregistered','skipped')
     or (outcome = 'accepted' and (ticket is null or length(ticket) > 128)) then
    raise exception 'invalid_push_result' using errcode = '22023';
  end if;
  select * into job from private.notification_push_deliveries
  where id = delivery_id and lease_id = claim_id and leased_until > now() for update;
  if not found then return false; end if;
  if outcome = 'unregistered' then
    -- 등록 이후 갱신/계정 전환된 토큰은 과거 receipt로 지우지 않는다.
    delete from public.push_tokens t using private.notifications n
    where t.id = job.token_id and n.id = job.notification_id and t.user_id = n.recipient_id
      and t.updated_at = job.token_updated_at;
  end if;
  update private.notification_push_deliveries set
    state = case outcome when 'accepted' then 'receipt' when 'delivered' then 'delivered'
      when 'retry' then 'pending' when 'receipt_retry' then 'receipt'
      when 'skipped' then 'skipped' else 'failed' end,
    ticket_id = case when outcome = 'accepted' then ticket
      when outcome = 'retry' then null else ticket_id end,
    available_at = now() + case when outcome = 'accepted' then interval '15 minutes'
      else least(60, power(2, least(job.attempts, 6))) * interval '1 minute' end,
    lease_id = null, leased_until = null, last_error = left(error_code, 80)
  where id = job.id;
  update private.notifications n set push_sent_at = coalesce(n.push_sent_at, now())
  where n.id = job.notification_id
    and exists (select 1 from private.notification_push_deliveries d
      where d.notification_id = n.id and d.state in ('receipt','delivered'))
    and not exists (select 1 from private.notification_push_deliveries d
      where d.notification_id = n.id and d.state in ('pending','failed'));
  return true;
end;
$$;

create or replace function public.claim_notification_pushes(receipts boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.claim_notification_pushes(receipts);
$$;
create or replace function public.finish_notification_push(
  delivery_id bigint, claim_id uuid, outcome text, ticket text default null, error_code text default null
)
returns boolean language sql security invoker set search_path = '' as $$
  select private.finish_notification_push(delivery_id, claim_id, outcome, ticket, error_code);
$$;
revoke execute on function private.push_notification_allowed(bigint,bigint), private.enqueue_notification_push()
  from public, anon, authenticated, service_role;
revoke execute on function private.claim_notification_pushes(boolean), public.claim_notification_pushes(boolean),
  private.finish_notification_push(bigint,uuid,text,text,text), public.finish_notification_push(bigint,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function private.claim_notification_pushes(boolean), public.claim_notification_pushes(boolean),
  private.finish_notification_push(bigint,uuid,text,text,text), public.finish_notification_push(bigint,uuid,text,text,text)
  to service_role;

create extension if not exists pg_net with schema extensions;
-- Vault 최초 설정은 배포 후 운영자가 한다. 설정 전에는 호출하지 않는다.
create or replace function private.invoke_notification_push()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  function_url text;
  dispatch_secret text;
begin
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if function_url is null or dispatch_secret is null then return null; end if;
  return net.http_post(url := function_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || dispatch_secret),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
end;
$$;
revoke execute on function private.invoke_notification_push() from public, anon, authenticated, service_role;
select cron.schedule('notifications-push-dispatch', '* * * * *', 'select private.invoke_notification_push()');
