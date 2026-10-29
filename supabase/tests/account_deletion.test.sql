begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) values
 ('16400000-0000-0000-0000-000000000001','admin164@test.invalid'),
 ('16400000-0000-0000-0000-000000000002','due164@test.invalid'),
 ('16400000-0000-0000-0000-000000000003','recent164@test.invalid'),
 ('16400000-0000-0000-0000-000000000004','released164@test.invalid'),
 ('16400000-0000-0000-0000-000000000005','abuse164@test.invalid');
insert into private.admin_users(id,email,role) values ('16400000-0000-0000-0000-000000000001','admin164@test.invalid','operator');
insert into auth.sessions(id,user_id) values ('16400000-0000-0000-0001-000000000001','16400000-0000-0000-0000-000000000001');
update public.profiles set status='suspended', suspended_at=now() where id in
 ('16400000-0000-0000-0000-000000000002','16400000-0000-0000-0000-000000000003','16400000-0000-0000-0000-000000000005');

create function pg_temp.sanction(target uuid, category public.report_reason, age interval, released boolean default false) returns void language plpgsql as $$
declare action bigint;
begin
  insert into private.admin_actions(admin_id,request_id,action,target_type,target_id,reason_category,reason,before_state,after_state)
    values('16400000-0000-0000-0000-000000000001',gen_random_uuid(),'suspended','user',target::text,category,'확인','{}','{}') returning id into action;
  insert into private.user_sanctions(user_id,action_id,kind,reason_category,created_at,released_at)
    values(target,action,'suspended',category,now()-age,case when released then now() end);
end;
$$;
select pg_temp.sanction('16400000-0000-0000-0000-000000000002','underage',interval '1 month 1 day');
select pg_temp.sanction('16400000-0000-0000-0000-000000000003','underage',interval '10 days');
select pg_temp.sanction('16400000-0000-0000-0000-000000000004','underage',interval '2 months',true);
select pg_temp.sanction('16400000-0000-0000-0000-000000000005','abuse',interval '2 months');

set local role authenticated;
select throws_ok($$select public.store_apple_refresh_token('16400000-0000-0000-0000-000000000002','token')$$,'42501',null,'앱 사용자는 애플 토큰을 저장할 수 없음');
select throws_ok($$select * from public.due_underage_deletions()$$,'42501',null,'앱 사용자는 삭제 대상을 조회할 수 없음');
select throws_ok($$select * from private.apple_refresh_tokens$$,'42501',null,'토큰 테이블 직접 조회 불가');
reset role;
set local role anon;
select throws_ok($$select * from public.due_underage_deletions()$$,'42501',null,'비회원도 삭제 대상 조회 불가');
reset role;

set local role service_role;
select throws_ok($$select public.store_apple_refresh_token('16400000-0000-0000-0000-000000000002','')$$,'22023','invalid_apple_refresh_token','빈 토큰 거부');
select lives_ok($$select public.store_apple_refresh_token('16400000-0000-0000-0000-000000000002','first-token')$$,'애플 토큰 저장');
select lives_ok($$select public.store_apple_refresh_token('16400000-0000-0000-0000-000000000002','second-token')$$,'다시 로그인하면 새 토큰으로 교체');
select throws_ok($$select * from private.apple_refresh_tokens$$,'42501',null,'서비스 역할도 토큰 테이블 직접 조회 불가');
select results_eq($$select user_id, apple_refresh_token from public.due_underage_deletions()$$,
  $$values ('16400000-0000-0000-0000-000000000002'::uuid, 'second-token'::text)$$,
  '만 14세 미만으로 이용 중단 후 한 달이 지난 계정만 최신 토큰과 함께 조회');
reset role;

select is((select count(*)::int from private.apple_refresh_tokens),1,'계정당 토큰 하나');
select is((select count(*)::int from vault.secrets s join private.apple_refresh_tokens t on t.secret_id=s.id),1,'토큰은 Vault에만 보관');
select is(private.invoke_underage_cleanup(),null,'Vault 주소·비밀값이 없으면 함수를 부르지 않음');
select ok(exists(select 1 from cron.job where jobname='underage-account-cleanup'),'매일 자동 삭제 작업 등록');

insert into private.moderation_requests(id,admin_id,user_id,action,reason_category,reason) values
 ('16400000-0000-0000-0002-000000000001','16400000-0000-0000-0000-000000000001','16400000-0000-0000-0000-000000000002','release','underage','정정 확인');
set local role service_role;
select is(public.claim_underage_deletion('16400000-0000-0000-0000-000000000002'),false,'해제 요청이 진행 중이면 삭제를 시작하지 않음');
select is(public.claim_underage_deletion('16400000-0000-0000-0000-000000000003'),false,'아직 한 달이 안 된 계정은 삭제를 시작하지 않음');
select is(public.claim_underage_deletion('16400000-0000-0000-0000-000000000004'),false,'운영자가 해제한 계정은 삭제를 시작하지 않음');
reset role;
delete from private.moderation_requests where id='16400000-0000-0000-0002-000000000001';
set local role service_role;
select is(public.claim_underage_deletion('16400000-0000-0000-0000-000000000002'),true,'아직 대상이면 삭제 시작');
select is(public.claim_underage_deletion('16400000-0000-0000-0000-000000000002'),false,'같은 계정을 동시에 두 번 처리하지 않음');
select is((select count(*)::int from public.due_underage_deletions()),0,'삭제 중인 계정은 다시 목록에 넣지 않음');
select throws_ok($$select public.admin_prepare_sanction('16400000-0000-0000-0000-000000000001','16400000-0000-0000-0001-000000000001',gen_random_uuid(),'16400000-0000-0000-0000-000000000002','release','underage','정정 확인')$$,'55000','account_deletion_in_progress','삭제를 시작한 뒤에는 운영자가 해제할 수 없음');
reset role;

select secret_id as old_secret from private.apple_refresh_tokens where user_id='16400000-0000-0000-0000-000000000002' \gset
delete from auth.users where id='16400000-0000-0000-0000-000000000002';
select is((select count(*)::int from private.apple_refresh_tokens),0,'계정을 지우면 토큰 행도 삭제');
select is((select count(*)::int from vault.secrets where id=:'old_secret'),0,'계정을 지우면 Vault 토큰도 삭제');
select is((select count(*)::int from public.due_underage_deletions()),0,'삭제한 계정은 다시 대상이 아님');
select * from finish();
rollback;
