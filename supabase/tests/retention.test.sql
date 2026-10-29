begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) values
 ('16410000-0000-0000-0000-000000000001','admin164r@test.invalid'),
 ('16410000-0000-0000-0000-000000000002','author164r@test.invalid'),
 ('16410000-0000-0000-0000-000000000003','reporter164r@test.invalid');
insert into auth.sessions(id,user_id) values ('16410000-0000-0000-0001-000000000001','16410000-0000-0000-0000-000000000001');
insert into private.admin_users(id,email,role) values ('16410000-0000-0000-0000-000000000001','admin164r@test.invalid','operator');
insert into private.posts(author_id,type,content) values('16410000-0000-0000-0000-000000000002','post','신고 대상 본문') returning id as post_id \gset
insert into private.comments(post_id,author_id,content) values(:post_id,'16410000-0000-0000-0000-000000000002','첫 댓글') returning id as c1 \gset
insert into private.comments(post_id,author_id,content) values(:post_id,'16410000-0000-0000-0000-000000000002','둘째 댓글') returning id as c2 \gset
insert into private.comments(post_id,author_id,content) values(:post_id,'16410000-0000-0000-0000-000000000002','셋째 댓글') returning id as c3 \gset

-- 신고 대상 콘텐츠 사본
insert into private.reports(reporter_id,target_type,comment_id,reported_user_id,reason,reported_content,status,updated_at) values
 ('16410000-0000-0000-0000-000000000003','comment',:c1,'16410000-0000-0000-0000-000000000002','other','오래된 처리 완료 사본','resolved',now()-interval '31 days') returning id as old_report \gset
insert into private.reports(reporter_id,target_type,comment_id,reported_user_id,reason,reported_content,status,updated_at) values
 ('16410000-0000-0000-0000-000000000003','comment',:c2,'16410000-0000-0000-0000-000000000002','other','최근 처리 사본','rejected',now()-interval '29 days') returning id as recent_report \gset
insert into private.reports(reporter_id,target_type,comment_id,reported_user_id,reason,reported_content,status,updated_at) values
 ('16410000-0000-0000-0000-000000000003','comment',:c3,'16410000-0000-0000-0000-000000000002','other','검토 중 사본','reviewing',now()-interval '90 days') returning id as open_report \gset

-- 제재 이력과 조치 기록
create function pg_temp.sanction(kind public.account_status, created interval, until_age interval, released interval, action_age interval) returns bigint language plpgsql as $$
declare action bigint; sanction bigint;
begin
  insert into private.admin_actions(admin_id,request_id,action,target_type,target_id,reason_category,reason,before_state,after_state,created_at)
    values('16410000-0000-0000-0000-000000000001',gen_random_uuid(),kind::text,'user','16410000-0000-0000-0000-000000000002','abuse','확인','{}','{}',now()-action_age) returning id into action;
  insert into private.user_sanctions(user_id,action_id,kind,reason_category,created_at,restricted_until,released_at)
    values('16410000-0000-0000-0000-000000000002',action,kind,'abuse',now()-created,
      case when until_age is not null then now()-until_age end,case when released is not null then now()-released end)
    returning id into sanction;
  return sanction;
end;
$$;
select pg_temp.sanction('warning',interval '7 months',null,null,interval '7 months') as old_warning \gset
select pg_temp.sanction('warning',interval '5 months',null,null,interval '5 months') as recent_warning \gset
select pg_temp.sanction('community_restricted',interval '8 months',interval '7 months',null,interval '8 months') as old_restricted \gset
select pg_temp.sanction('suspended',interval '2 years',null,interval '7 months',interval '2 years') as old_released \gset
select pg_temp.sanction('suspended',interval '2 years',null,null,interval '2 years') as unreleased \gset
select pg_temp.sanction('warning',interval '13 months',null,null,interval '13 months') as held_warning \gset
insert into private.admin_actions(admin_id,request_id,action,target_type,target_id,reason_category,reason,before_state,after_state,created_at)
  values('16410000-0000-0000-0000-000000000001',gen_random_uuid(),'hide','post',:'post_id','spam','확인','{}','{}',now()-interval '13 months') returning id as old_action \gset
insert into private.admin_actions(admin_id,request_id,action,target_type,target_id,reason_category,reason,before_state,after_state,created_at)
  values('16410000-0000-0000-0000-000000000001',gen_random_uuid(),'hide','post',:'post_id','spam','확인','{}','{}',now()-interval '11 months') returning id as recent_action \gset
insert into private.moderation_requests(id,admin_id,user_id,action,reason_category,reason,state,created_at,action_id) values
 (gen_random_uuid(),'16410000-0000-0000-0000-000000000001','16410000-0000-0000-0000-000000000002','warning','abuse','확인','applied',now()-interval '13 months',:'old_action');

insert into private.admin_access_logs(admin_id,report_id,created_at) values
 ('16410000-0000-0000-0000-000000000001',:'recent_report',now()-interval '13 months'),
 ('16410000-0000-0000-0000-000000000001',:'recent_report',now()-interval '11 months');

-- 탈퇴 사유 설문
insert into private.withdrawal_surveys(reasons,created_at) values ('{rarely_used}',now()-interval '31 days'),('{rarely_used}',now()-interval '29 days');

set local role authenticated;
select throws_ok($$select public.admin_set_retention_hold('16410000-0000-0000-0000-000000000001','16410000-0000-0000-0001-000000000001','sanction',1,true)$$,'42501',null,'앱 사용자는 보관 유지를 표시할 수 없음');
select throws_ok($$select * from private.retention_holds$$,'42501',null,'보관 유지 표시 직접 조회 불가');
reset role;
set local role service_role;
select throws_ok($$select public.admin_set_retention_hold('16410000-0000-0000-0000-000000000002',gen_random_uuid(),'sanction',1,true)$$,'42501','admin_required','운영자만 보관 유지 표시');
select throws_ok($$select public.admin_set_retention_hold('16410000-0000-0000-0000-000000000001','16410000-0000-0000-0001-000000000001','post',1,true)$$,'22023','invalid_retention_hold','신고·제재만 보관 유지');
select throws_ok($$select public.admin_set_retention_hold('16410000-0000-0000-0000-000000000001','16410000-0000-0000-0001-000000000001','sanction',9223372036854775807,true)$$,'P0002','retention_target_not_found','없는 대상 거부');
select is(public.admin_set_retention_hold('16410000-0000-0000-0000-000000000001','16410000-0000-0000-0001-000000000001','sanction',:'held_warning',true),true,'분쟁 중인 제재 보관 유지');
select is(public.admin_set_retention_hold('16410000-0000-0000-0000-000000000001','16410000-0000-0000-0001-000000000001','report',:'recent_report',true),true,'보관 유지 표시');
select is(public.admin_set_retention_hold('16410000-0000-0000-0000-000000000001','16410000-0000-0000-0001-000000000001','report',:'recent_report',false),false,'분쟁이 끝나면 보관 유지 해제');
select is(public.admin_set_retention_hold('16410000-0000-0000-0000-000000000001','16410000-0000-0000-0001-000000000001','report',:'old_report',true),true,'처리 완료 사본 보관 유지');
reset role;

select private.delete_expired_records();

select is((select count(*)::int from private.withdrawal_surveys),1,'탈퇴 30일이 지난 설문만 삭제');
select is((select reported_content from private.reports where id=:'old_report'),'오래된 처리 완료 사본','보관 유지 중인 사본은 남김');
select is((select reported_content from private.reports where id=:'recent_report'),'최근 처리 사본','처리 완료 30일 전 사본은 남김');
select is((select reported_content from private.reports where id=:'open_report'),'검토 중 사본','처리 중인 신고 사본은 남김');
select is((select count(*)::int from private.reports),3,'신고 기록 자체는 지우지 않음');
select public.admin_set_retention_hold('16410000-0000-0000-0000-000000000001','16410000-0000-0000-0001-000000000001','report',:'old_report',false);
select private.delete_expired_records();
select is((select reported_content from private.reports where id=:'old_report'),null,'보관 유지를 풀면 처리 완료 30일 지난 사본 삭제');

select is((select array_agg(id order by id) from private.user_sanctions),
  array[:'recent_warning',:'unreleased',:'held_warning']::bigint[],
  '경고 6개월·제한 종료 6개월·해제 6개월이 지난 제재만 삭제, 해제 전 영구 제한과 보관 유지는 남김');
select ok(not exists(select 1 from private.admin_actions where id=:'old_action'),'1년 지난 조치 기록과 그 요청 삭제');
select ok(exists(select 1 from private.admin_actions where id=:'recent_action'),'1년 전 조치 기록은 남김');
select ok(exists(select 1 from private.admin_actions a join private.user_sanctions s on s.action_id=a.id where s.id=:'unreleased'),'남은 제재의 조치 기록은 1년이 지나도 남김');
select is((select count(*)::int from private.admin_access_logs),1,'1년 지난 운영자 조회 기록만 삭제');
select ok(exists(select 1 from cron.job where jobname='expired-records-cleanup'),'매일 보관기간 정리 작업 등록');
select * from finish();
rollback;
