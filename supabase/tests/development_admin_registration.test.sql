begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- CLI의 pgTAP 컨테이너에는 tests만 마운트된다. 실제 적용한 원문을 이력에서 읽어 재실행한다.
create function pg_temp.register_development_admins() returns void language plpgsql as $$
declare migration_sql text;
begin
  select array_to_string(statements,E';\n') into migration_sql
  from supabase_migrations.schema_migrations where version='20261121031503';
  if migration_sql is null then raise exception 'registration_migration_missing'; end if;
  execute migration_sql;
end;
$$;

select pg_temp.register_development_admins();
select is((select count(*) from private.admin_users where id in
  ('25230b16-95fa-469c-86ef-35ed8cda0f3f','36ff500f-f715-4c06-9dba-904edda79f1c')),0::bigint,
  '개발 Auth UUID가 없는 환경에서는 등록하지 않는다');

insert into auth.users(id,email,email_confirmed_at,encrypted_password) values
  ('25230b16-95fa-469c-86ef-35ed8cda0f3f','wrong224@test.invalid',now(),repeat('x',60)),
  ('36ff500f-f715-4c06-9dba-904edda79f1c','digginmanagertest@gmail.com',null,repeat('x',60)),
  ('22400000-0000-0000-0000-000000000099','other224@test.invalid',now(),repeat('x',60));
select pg_temp.register_development_admins();
select is((select count(*) from private.admin_users where id='25230b16-95fa-469c-86ef-35ed8cda0f3f'),0::bigint,
  'UUID가 같아도 이메일이 다르면 등록하지 않는다');
select is((select count(*) from private.admin_users where id='36ff500f-f715-4c06-9dba-904edda79f1c'),0::bigint,
  '이메일 확인이 끝나지 않은 계정은 등록하지 않는다');

update auth.users set email='diggin.app@gmail.com',encrypted_password=null where id='25230b16-95fa-469c-86ef-35ed8cda0f3f';
select pg_temp.register_development_admins();
select is((select count(*) from private.admin_users where id='25230b16-95fa-469c-86ef-35ed8cda0f3f'),0::bigint,
  '비밀번호 로그인을 준비하지 않은 계정은 등록하지 않는다');

update auth.users set encrypted_password=repeat('x',60) where id='25230b16-95fa-469c-86ef-35ed8cda0f3f';
update auth.users set email_confirmed_at=now() where id='36ff500f-f715-4c06-9dba-904edda79f1c';
select pg_temp.register_development_admins();
select is((select email||':'||role from private.admin_users where id='25230b16-95fa-469c-86ef-35ed8cda0f3f'),
  'diggin.app@gmail.com:operator','확인한 첫 계정은 일반 운영자로 등록한다');
select is((select email||':'||role from private.admin_users where id='36ff500f-f715-4c06-9dba-904edda79f1c'),
  'digginmanagertest@gmail.com:operator','확인한 두 번째 계정도 일반 운영자로 등록한다');
select is((select count(*) from private.admin_users where id='22400000-0000-0000-0000-000000000099'),0::bigint,
  '다른 앱 사용자는 운영자로 승격하지 않는다');

update private.admin_users set role='super_admin',disabled_at=now() where id='25230b16-95fa-469c-86ef-35ed8cda0f3f';
select pg_temp.register_development_admins();
select ok((select role='super_admin' and disabled_at is not null from private.admin_users where id='25230b16-95fa-469c-86ef-35ed8cda0f3f'),
  '재실행해도 기존 권한이나 비활성화 상태를 변경하지 않는다');
select is((select count(*) from private.admin_users where id in
  ('25230b16-95fa-469c-86ef-35ed8cda0f3f','36ff500f-f715-4c06-9dba-904edda79f1c')),2::bigint,
  '재실행으로 운영자 등록을 중복하지 않는다');

select * from finish();
rollback;
