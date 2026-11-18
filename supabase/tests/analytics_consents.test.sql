begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('15600000-0000-0000-0000-000000000001','admin156@test.invalid'),
 ('15600000-0000-0000-0000-000000000002','agree156@test.invalid'),
 ('15600000-0000-0000-0000-000000000003','never156@test.invalid'),
 ('15600000-0000-0000-0000-000000000004','mail156@test.invalid'),
 ('15600000-0000-0000-0000-000000000005','MAIL156@test.invalid');
insert into private.admin_users(id,email,role) values ('15600000-0000-0000-0000-000000000001','admin156@test.invalid','operator');
insert into auth.sessions(id,user_id) values ('15600000-0000-0000-0001-000000000001','15600000-0000-0000-0000-000000000001');

set local role anon;
select throws_ok($$select public.get_analytics_consent()$$,'42501',null,'비회원은 동의 조회 불가');
select throws_ok($$select public.set_analytics_consent(true,true,'signup')$$,'42501',null,'비회원은 동의 저장 불가');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"15600000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.get_analytics_consent(),'{"usage_analysis":false,"overseas_transfer":false}'::jsonb,'기록이 없으면 미동의');
select is(public.set_analytics_consent(true,false,'signup'),'{"usage_analysis":true,"overseas_transfer":false}'::jsonb,'가입 때 항목별로 저장');
select throws_ok($$select public.set_analytics_consent(true,true,'operator')$$,'22023','invalid_analytics_consent','앱은 운영자 기록을 남길 수 없음');
select throws_ok($$select public.set_analytics_consent(null,true,'settings')$$,'22023','invalid_analytics_consent','값이 비면 거부');
select throws_ok($$select * from private.analytics_consent_logs$$,'42501',null,'이력 테이블 직접 조회 불가');
select throws_ok($$select public.claim_amplitude_deletions()$$,'42501',null,'앱은 삭제 대기열을 가져갈 수 없음');
select throws_ok($$select public.admin_withdraw_analytics_consent('15600000-0000-0000-0000-000000000001','15600000-0000-0000-0001-000000000001','agree156@test.invalid')$$,'42501',null,'앱은 운영자 철회를 부를 수 없음');
select lives_ok($$select public.set_analytics_consent(true,false,'settings')$$,'같은 값으로 다시 저장');
select lives_ok($$select public.set_analytics_consent(true,true,'settings')$$,'국외 이전 동의');
select lives_ok($$select public.set_analytics_consent(false,true,'settings')$$,'이용 분석 철회');
reset role;

select is((select count(*)::int from private.analytics_consent_logs where user_id='15600000-0000-0000-0000-000000000002' and item='usage_analysis'),2,'바뀐 값만 이력으로 쌓음');
select is((select count(*)::int from private.analytics_consent_logs where user_id='15600000-0000-0000-0000-000000000002' and item='overseas_transfer'),2,'가입 때 체크하지 않은 항목도 미동의로 남김');
select is((select reason from private.amplitude_deletion_jobs where user_id='15600000-0000-0000-0000-000000000002'),'consent_withdrawn','두 항목 동의 중 철회하면 삭제 요청');

-- 같은 회원의 대기 중 삭제 요청은 하나만 둔다.
set local role authenticated;
set local request.jwt.claims = '{"sub":"15600000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok($$select public.set_analytics_consent(true,true,'settings')$$,'다시 동의');
select lives_ok($$select public.set_analytics_consent(true,false,'settings')$$,'다시 철회');
set local request.jwt.claims = '{"sub":"15600000-0000-0000-0000-000000000003","role":"authenticated"}';
select lives_ok($$select public.set_analytics_consent(true,false,'signup')$$,'한 항목만 동의한 회원');
select lives_ok($$select public.set_analytics_consent(false,false,'settings')$$,'수집된 적 없는 회원의 철회');
reset role;
select is((select count(*)::int from private.amplitude_deletion_jobs where user_id='15600000-0000-0000-0000-000000000002'),1,'대기 중 삭제 요청은 하나');
select is((select count(*)::int from private.amplitude_deletion_jobs where user_id='15600000-0000-0000-0000-000000000003'),0,'수집된 적 없으면 삭제 요청 없음');

-- 운영자 이메일 철회
set local role service_role;
select throws_ok($$select public.admin_withdraw_analytics_consent('15600000-0000-0000-0000-000000000002',gen_random_uuid(),'agree156@test.invalid')$$,'42501','admin_required','운영자가 아니면 거부');
select throws_ok($$select public.admin_withdraw_analytics_consent('15600000-0000-0000-0000-000000000001','15600000-0000-0000-0001-000000000001','none156@test.invalid')$$,'P0002','user_not_found','없는 이메일');
select throws_ok($$select public.admin_withdraw_analytics_consent('15600000-0000-0000-0000-000000000001','15600000-0000-0000-0001-000000000001','mail156@test.invalid')$$,'P0001','user_email_conflict','같은 이메일 계정이 둘이면 고르지 않음');
reset role;
update private.amplitude_deletion_jobs set completed_at=now() where user_id='15600000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"15600000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok($$select public.set_analytics_consent(true,true,'settings')$$,'철회 처리 전 다시 동의');
reset role;
set local role service_role;
select is(public.admin_withdraw_analytics_consent('15600000-0000-0000-0000-000000000001','15600000-0000-0000-0001-000000000001',' Agree156@test.invalid ')
  - 'user_id','{"usage_analysis":false,"overseas_transfer":false}'::jsonb,'대소문자·공백과 관계없이 찾아 두 항목 미동의');
reset role;
select is((select count(*)::int from private.analytics_consent_logs where user_id='15600000-0000-0000-0000-000000000002' and source='operator' and admin_id='15600000-0000-0000-0000-000000000001'),2,'운영자 처리 기록');
select is((select count(*)::int from private.amplitude_deletion_jobs where user_id='15600000-0000-0000-0000-000000000002' and completed_at is null),1,'운영자 철회도 삭제 요청');

-- 삭제 대기열 처리
set local role service_role;
select set_config('test.claim',(public.claim_amplitude_deletions()->>'claim_id'),true);
select is(jsonb_array_length((select user_ids from (select public.claim_amplitude_deletions() ->'user_ids' as user_ids) x)),0,'처리 중인 요청은 다시 가져가지 않음');
select is(public.finish_amplitude_deletions(current_setting('test.claim')::uuid,false,'http_500'),1,'실패 기록');
reset role;
select ok((select available_at > now() and completed_at is null and last_error='http_500' from private.amplitude_deletion_jobs where user_id='15600000-0000-0000-0000-000000000002' and completed_at is null),'실패하면 나중에 다시 시도');
update private.amplitude_deletion_jobs set available_at=now() where completed_at is null;
set local role service_role;
select set_config('test.claim2',(public.claim_amplitude_deletions()->>'claim_id'),true);
select is(public.finish_amplitude_deletions(current_setting('test.claim')::uuid,true),0,'지난 처리 결과는 반영하지 않음');
select is(public.finish_amplitude_deletions(current_setting('test.claim2')::uuid,true),1,'성공 기록');
reset role;
select is((select count(*)::int from private.amplitude_deletion_jobs where completed_at is null),0,'성공하면 대기열에서 끝남');

-- 탈퇴·미성년 정리처럼 회원이 지워질 때
delete from auth.users where id in ('15600000-0000-0000-0000-000000000002','15600000-0000-0000-0000-000000000003');
select is((select reason from private.amplitude_deletion_jobs where user_id='15600000-0000-0000-0000-000000000002' and completed_at is null),'account_deleted','두 항목에 동의한 적 있는 회원은 탈퇴 시 삭제 요청');
select is((select count(*)::int from private.amplitude_deletion_jobs where user_id='15600000-0000-0000-0000-000000000003'),0,'수집된 적 없는 회원은 요청 없음');
select is((select count(*)::int from private.analytics_consent_logs where user_id in ('15600000-0000-0000-0000-000000000002','15600000-0000-0000-0000-000000000003')),0,'탈퇴하면 동의 이력도 지움');

select * from finish();
rollback;
