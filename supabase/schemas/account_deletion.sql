-- 운영자 손 없이 애플 연결을 끊으려고 애플 로그인 때 받은 refresh token을 Vault에 보관한다(#164).
create table private.apple_refresh_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secret_id uuid not null unique,
  updated_at timestamptz not null default now()
);
alter table private.apple_refresh_tokens enable row level security;
revoke all on table private.apple_refresh_tokens from public, anon, authenticated, service_role;

create or replace function private.delete_apple_refresh_token_secret()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$$;
revoke execute on function private.delete_apple_refresh_token_secret() from public, anon, authenticated, service_role;
create trigger apple_refresh_tokens_delete_secret after delete on private.apple_refresh_tokens
  for each row execute function private.delete_apple_refresh_token_secret();

create or replace function private.store_apple_refresh_token(target_user uuid, refresh_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare existing uuid;
begin
  if target_user is null or refresh_token is null or refresh_token !~ '^[[:graph:]]+$' or
    pg_catalog.length(refresh_token) > 4096 then
    raise exception 'invalid_apple_refresh_token' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user::text, 0));
  select secret_id into existing from private.apple_refresh_tokens where user_id = target_user;
  if existing is null then
    insert into private.apple_refresh_tokens(user_id, secret_id)
      values (target_user, vault.create_secret(refresh_token));
  else
    perform vault.update_secret(existing, refresh_token);
    update private.apple_refresh_tokens set updated_at = now() where user_id = target_user;
  end if;
end;
$$;
revoke execute on function private.store_apple_refresh_token(uuid, text) from public, anon, authenticated;
grant execute on function private.store_apple_refresh_token(uuid, text) to service_role;

-- 삭제를 시작한 계정. 운영자 해제와 같은 프로필 행 잠금으로 순서를 정해 복구한 계정을 지우지 않는다.
create table private.underage_deletion_claims (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now()
);
alter table private.underage_deletion_claims enable row level security;
revoke all on table private.underage_deletion_claims from public, anon, authenticated, service_role;

create or replace function private.is_underage_deletion_due(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join lateral (
      select s.reason_category, s.created_at from private.user_sanctions s
      where s.user_id = p.id and s.kind = 'suspended' and s.released_at is null
      order by s.id desc limit 1
    ) sanction on true
    where p.id = target and p.status = 'suspended' and sanction.reason_category = 'underage'
      and sanction.created_at <= now() - interval '1 month'
  );
$$;
revoke execute on function private.is_underage_deletion_due(uuid) from public, anon, authenticated, service_role;

-- 삭제 직전에 부른다. 아직 대상이고 진행 중인 제재·해제 요청이 없을 때만 표시하고 true를 돌려준다.
create or replace function private.claim_underage_deletion(target uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.profiles where id = target for update;
  if not found or not private.is_underage_deletion_due(target) or
    exists (select 1 from private.moderation_requests where user_id = target and state = 'pending') or
    exists (select 1 from private.underage_deletion_claims where user_id = target and claimed_at > now() - interval '1 hour') then
    return false;
  end if;
  insert into private.underage_deletion_claims(user_id) values (target)
    on conflict (user_id) do update set claimed_at = now();
  return true;
end;
$$;
revoke execute on function private.claim_underage_deletion(uuid) from public, anon, authenticated;
grant execute on function private.claim_underage_deletion(uuid) to service_role;

create or replace function public.claim_underage_deletion(target uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.claim_underage_deletion(target);
$$;
revoke execute on function public.claim_underage_deletion(uuid) from public, anon, authenticated;
grant execute on function public.claim_underage_deletion(uuid) to service_role;

-- AUTH-002~004 만 14세 미만으로 이용 중단한 지 한 달이 지나도 해제되지 않은 계정. 한 번에 50개씩 처리한다.
create or replace function private.due_underage_deletions()
returns table(user_id uuid, apple_refresh_token text) language sql stable security definer set search_path = '' as $$
  select p.id, secret.decrypted_secret
  from public.profiles p
  join lateral (
    select s.reason_category, s.created_at from private.user_sanctions s
    where s.user_id = p.id and s.kind = 'suspended' and s.released_at is null
    order by s.id desc limit 1
  ) sanction on true
  left join private.apple_refresh_tokens token on token.user_id = p.id
  left join vault.decrypted_secrets secret on secret.id = token.secret_id
  where p.status = 'suspended' and sanction.reason_category = 'underage'
    and sanction.created_at <= now() - interval '1 month'
    and not exists (select 1 from private.underage_deletion_claims c where c.user_id = p.id and c.claimed_at > now() - interval '1 hour')
  order by sanction.created_at
  limit 50;
$$;
revoke execute on function private.due_underage_deletions() from public, anon, authenticated;
grant execute on function private.due_underage_deletions() to service_role;

create or replace function public.store_apple_refresh_token(target_user uuid, refresh_token text)
returns void language sql security invoker set search_path = '' as $$
  select private.store_apple_refresh_token(target_user, refresh_token);
$$;
revoke execute on function public.store_apple_refresh_token(uuid, text) from public, anon, authenticated;
grant execute on function public.store_apple_refresh_token(uuid, text) to service_role;

create or replace function public.due_underage_deletions()
returns table(user_id uuid, apple_refresh_token text) language sql stable security invoker set search_path = '' as $$
  select * from private.due_underage_deletions();
$$;
revoke execute on function public.due_underage_deletions() from public, anon, authenticated;
grant execute on function public.due_underage_deletions() to service_role;

create or replace function private.invoke_underage_cleanup()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  function_url text;
  cleanup_secret text;
begin
  if not exists (select 1 from private.due_underage_deletions()) then return null; end if;
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'underage_cleanup_url';
  select decrypted_secret into cleanup_secret from vault.decrypted_secrets where name = 'underage_cleanup_secret';
  if function_url is null or cleanup_secret is null then return null; end if;
  return net.http_post(url := function_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || cleanup_secret),
    body := '{}'::jsonb, timeout_milliseconds := 5000);
end;
$$;
revoke execute on function private.invoke_underage_cleanup() from public, anon, authenticated, service_role;
select cron.schedule('underage-account-cleanup', '30 18 * * *', 'select private.invoke_underage_cleanup()');
