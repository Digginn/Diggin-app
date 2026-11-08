begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- 실제 계정이 없는 로컬/CI에서도 마이그레이션을 재현한다.
\ir ../supabase/migrations/20261021173103_register_retool_operator.sql
select is((select count(*) from private.admin_users where id = '2d156904-38dc-412c-88eb-7a0cc5419e6d'), 0::bigint,
  'Auth 계정이 없으면 등록하지 않는다');

insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data) values
  ('2d156904-38dc-412c-88eb-7a0cc5419e6d', 'retool115@test.invalid', null, '{}'),
  ('11500000-0000-0000-0000-000000000001', 'other115@test.invalid', now(), '{}');
\ir ../supabase/migrations/20261021173103_register_retool_operator.sql
select is((select count(*) from private.admin_users where id = '2d156904-38dc-412c-88eb-7a0cc5419e6d'), 0::bigint,
  '이메일을 확인하지 않은 계정은 등록하지 않는다');

update auth.users set email_confirmed_at = now() where id = '2d156904-38dc-412c-88eb-7a0cc5419e6d';
\ir ../supabase/migrations/20261021173103_register_retool_operator.sql
select is((select email || ':' || role from private.admin_users where id = '2d156904-38dc-412c-88eb-7a0cc5419e6d'),
  'retool115@test.invalid:operator', '지정한 계정만 Auth 이메일로 일반 운영자에 등록한다');
select is((select count(*) from private.admin_users where id = '11500000-0000-0000-0000-000000000001'), 0::bigint,
  '다른 Auth 계정에는 권한을 주지 않는다');

update private.admin_users set disabled_at = now() where id = '2d156904-38dc-412c-88eb-7a0cc5419e6d';
\ir ../supabase/migrations/20261021173103_register_retool_operator.sql
select ok((select disabled_at = now() and role = 'operator' from private.admin_users
  where id = '2d156904-38dc-412c-88eb-7a0cc5419e6d'), '다시 실행해도 기존 권한과 비활성화 상태를 유지한다');

select * from finish();
rollback;
