-- 현재 표시할 약관과 계정의 동의 상태. 외부에는 검증된 소셜 identity의 상태만 반환한다.
create or replace function private.login_policy_status(target_user uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  terms public.legal_policies%rowtype;
  privacy public.legal_policies%rowtype;
  needs_consent boolean;
begin
  select * into terms from public.legal_policies
    where kind = 'terms' and effective_at <= now() order by effective_at desc, id desc limit 1;
  select * into privacy from public.legal_policies
    where kind = 'privacy' and effective_at <= now() order by effective_at desc, id desc limit 1;
  if terms.id is null or privacy.id is null then
    raise exception 'login_policies_not_configured' using errcode = 'P0001';
  end if;
  needs_consent := target_user is null
    or not exists (select 1 from public.profiles where id = target_user and age_confirmed_at is not null)
    or exists (
      select 1 from public.legal_policies latest where latest.id in (terms.id, privacy.id)
        and not exists (
          select 1 from private.user_policy_consents c
          join public.legal_policies agreed on agreed.id = c.policy_id
          where c.user_id = target_user and agreed.kind = latest.kind
            and (agreed.id = latest.id or (not latest.requires_reconsent and agreed.effective_at <= latest.effective_at))
        )
    );
  return jsonb_build_object('requires_consent', needs_consent, 'is_new_user', target_user is null,
    'terms_policy_id', terms.id, 'terms_version', terms.version,
    'privacy_policy_id', privacy.id, 'privacy_version', privacy.version);
end;
$$;

-- 제공자 서명 검증을 마친 Edge만 호출한다. UUID·이메일·동의 원문은 노출하지 않는다.
create or replace function private.lookup_login_policy_status(identity_provider text, identity_subject text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target_user uuid;
begin
  if identity_provider is null or identity_provider not in ('google', 'kakao', 'apple')
    or identity_subject is null or length(identity_subject) not between 1 and 1024 then
    raise exception 'invalid_identity' using errcode = '22023';
  end if;
  select user_id into target_user from auth.identities
    where provider = identity_provider and provider_id = identity_subject;
  return private.login_policy_status(target_user);
end;
$$;

create or replace function public.lookup_login_policy_status(identity_provider text, identity_subject text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.lookup_login_policy_status(identity_provider, identity_subject); $$;

-- 동의 후에만 인증한 계정에 기록한다. 조회 후 버전이 바뀌면 확인하지 않은 문서에 동의시키지 않는다.
create or replace function private.complete_login_consent(
  terms_policy_id bigint, privacy_policy_id bigint, age_confirmed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  current_state jsonb;
begin
  perform private.assert_account_access();
  perform 1 from public.profiles where id = viewer for update;
  current_state := private.login_policy_status(viewer);
  if terms_policy_id is distinct from (current_state->>'terms_policy_id')::bigint
    or privacy_policy_id is distinct from (current_state->>'privacy_policy_id')::bigint then
    raise exception 'login_policies_changed' using errcode = '22023';
  end if;
  if age_confirmed is true then
    insert into private.user_policy_consents(user_id, policy_id)
      values (viewer, terms_policy_id), (viewer, privacy_policy_id) on conflict do nothing;
    update public.profiles set age_confirmed_at = coalesce(age_confirmed_at, now()) where id = viewer;
  elsif (current_state->>'requires_consent')::boolean then
    raise exception 'login_consent_required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.complete_login_consent(
  terms_policy_id bigint, privacy_policy_id bigint, age_confirmed boolean
)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.complete_login_consent(terms_policy_id, privacy_policy_id, age_confirmed); $$;

revoke execute on function private.login_policy_status(uuid) from public, anon, authenticated;
revoke execute on function private.lookup_login_policy_status(text, text),
  public.lookup_login_policy_status(text, text) from public, anon, authenticated;
grant execute on function private.lookup_login_policy_status(text, text),
  public.lookup_login_policy_status(text, text) to service_role;
revoke execute on function private.complete_login_consent(bigint, bigint, boolean),
  public.complete_login_consent(bigint, bigint, boolean) from public, anon;
grant execute on function private.complete_login_consent(bigint, bigint, boolean),
  public.complete_login_consent(bigint, bigint, boolean) to authenticated;
