create table public.push_tokens (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_token_key unique (token),
  constraint push_tokens_platform check (platform in ('ios', 'android'))
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

create trigger push_tokens_set_updated_at
before update on public.push_tokens
for each row execute function private.set_updated_at();

alter table public.push_tokens enable row level security;

-- 로그아웃하면 앱이 그 기기 토큰을 지운다. 등록은 RPC로만 한다.
revoke all on table public.push_tokens from anon, authenticated;
grant select, delete on table public.push_tokens to authenticated;

create policy "push_tokens_select_own"
on public.push_tokens
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "push_tokens_delete_own"
on public.push_tokens
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- 한 기기에서 계정을 바꿔 로그인하면 같은 토큰이 다른 사용자로 옮겨가야 한다.
create or replace function private.register_push_token(new_token text, new_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  insert into public.push_tokens (user_id, token, platform)
  values (current_user_id, new_token, new_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform;
end;
$$;

create or replace function public.register_push_token(new_token text, new_platform text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.register_push_token(new_token, new_platform);
$$;

revoke execute on function private.register_push_token(text, text) from public, anon;
grant execute on function private.register_push_token(text, text) to authenticated;
revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
