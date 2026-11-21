-- 이메일 제공자는 관리자 비밀번호 로그인에 필요하므로 켜두고 공개 가입만 거부한다.
-- Auth Admin API의 계정 발급은 이 공개 가입 훅을 통하지 않는다.
create or replace function private.reject_public_email_signup(event jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select case when coalesce(event->'user'->'app_metadata'->>'provider','email') = 'email'
    then jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Email signup is disabled. Please use social sign-in.'))
    else '{}'::jsonb end;
$$;
revoke all on function private.reject_public_email_signup(jsonb) from public,anon,authenticated,service_role;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.reject_public_email_signup(jsonb) to supabase_auth_admin;
