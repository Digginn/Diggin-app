create table public.legal_policies (
  id bigint generated always as identity primary key,
  kind text not null,
  version text not null,
  effective_at timestamptz not null,
  document_url text not null,
  -- MY-009 동의 범위가 넓어지는 버전만 true
  requires_reconsent boolean not null default false,
  created_at timestamptz not null default now(),
  constraint legal_policies_kind check (kind in ('terms', 'privacy')),
  constraint legal_policies_document_url_https check (document_url ~* '^https://'),
  constraint legal_policies_kind_version_key unique (kind, version)
);

alter table public.legal_policies enable row level security;

-- 약관 화면은 비회원도 연다. 행은 운영자만 넣는다.
revoke all on table public.legal_policies from anon, authenticated;
grant select on table public.legal_policies to anon, authenticated;

create policy "legal_policies_select_all"
on public.legal_policies
for select
to anon, authenticated
using (true);

create table private.user_policy_consents (
  user_id uuid not null references public.profiles (id) on delete cascade,
  policy_id bigint not null references public.legal_policies (id),
  accepted_at timestamptz not null default now(),
  primary key (user_id, policy_id)
);

create index user_policy_consents_policy_id_idx on private.user_policy_consents (policy_id);

alter table private.user_policy_consents enable row level security;
revoke all on table private.user_policy_consents from anon, authenticated;

-- 종류별로 지금 시행 중인 최신 버전이 재동의 대상인데 아직 동의하지 않았으면 돌려준다.
create or replace function private.get_pending_policies()
returns setof public.legal_policies
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return query
  select latest.*
  from (
    select distinct on (policy.kind) policy.*
    from public.legal_policies as policy
    where policy.effective_at <= now()
    order by policy.kind, policy.effective_at desc
  ) as latest
  where latest.requires_reconsent
    and not exists (
      select 1
      from private.user_policy_consents as consent
      where consent.user_id = current_user_id
        and consent.policy_id = latest.id
    );
end;
$$;

create or replace function private.accept_policy(target_policy_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.legal_policies where id = target_policy_id and effective_at <= now()
  ) then
    raise exception 'policy_not_effective' using errcode = '22023';
  end if;

  insert into private.user_policy_consents (user_id, policy_id)
  values (current_user_id, target_policy_id)
  on conflict do nothing;
end;
$$;

create or replace function public.get_pending_policies()
returns setof public.legal_policies
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_pending_policies();
$$;

create or replace function public.accept_policy(target_policy_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.accept_policy(target_policy_id);
$$;

revoke execute on function private.get_pending_policies() from public, anon;
revoke execute on function private.accept_policy(bigint) from public, anon;
grant execute on function private.get_pending_policies() to authenticated;
grant execute on function private.accept_policy(bigint) to authenticated;

revoke execute on function public.get_pending_policies() from public, anon;
revoke execute on function public.accept_policy(bigint) from public, anon;
grant execute on function public.get_pending_policies() to authenticated;
grant execute on function public.accept_policy(bigint) to authenticated;
