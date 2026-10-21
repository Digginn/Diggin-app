begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,raw_app_meta_data) values
 ('11400000-0000-0000-0000-000000000001','admin114@test.invalid','{}'),
 ('11400000-0000-0000-0000-000000000002','author114@test.invalid','{}'),
 ('11400000-0000-0000-0000-000000000003','reporter114@test.invalid','{}'),
 ('11400000-0000-0000-0000-000000000004','other114@test.invalid','{}');
insert into auth.sessions(id,user_id) values
 ('11400000-0000-0000-0001-000000000001','11400000-0000-0000-0000-000000000001'),
 ('11400000-0000-0000-0001-000000000002','11400000-0000-0000-0000-000000000002');
insert into private.admin_users(id,email,role) values
 ('11400000-0000-0000-0000-000000000001','admin114@test.invalid','operator');
insert into private.posts(author_id,type,content) values('11400000-0000-0000-0000-000000000002','post','신고 대상 본문') returning id as post_id \gset
insert into private.comments(post_id,author_id,content) values(:post_id,'11400000-0000-0000-0000-000000000002','댓글 원문') returning id as comment_id \gset
insert into private.reports(reporter_id,target_type,post_id,reported_user_id,reason) values
 ('11400000-0000-0000-0000-000000000003','post',:post_id,'11400000-0000-0000-0000-000000000002','spam') returning id as report_id \gset
insert into private.reports(reporter_id,target_type,post_id,reported_user_id,reason) values
 ('11400000-0000-0000-0000-000000000004','post',:post_id,'11400000-0000-0000-0000-000000000002','abuse');
insert into private.reports(reporter_id,target_type,comment_id,reported_user_id,reason,reported_content) values
 ('11400000-0000-0000-0000-000000000003','comment',:comment_id,'11400000-0000-0000-0000-000000000002','other','신고 당시 댓글') returning id as comment_report_id \gset
select set_config('test.report', :'report_id',true),set_config('test.post',:'post_id',true),set_config('test.comment_report',:'comment_report_id',true);
select set_config('request.jwt.claims','{"sub":"11400000-0000-0000-0000-000000000002","role":"authenticated","session_id":"11400000-0000-0000-0001-000000000002"}',true);
set local role authenticated;
select throws_ok($$select public.admin_report_groups('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001')$$,'42501',null,'일반 사용자는 관리자 RPC를 실행할 수 없음');
select throws_ok($$select * from private.admin_actions$$,'42501',null,'감사 원본 직접 조회 불가');
select throws_ok($$select * from private.moderation_requests$$,'42501',null,'제재 준비 요청 직접 조회 불가');
select throws_ok($$select private.assert_moderator('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001')$$,'42501',null,'내부 권한 검사 함수 직접 실행 불가');
reset role;
set local role anon;
select throws_ok($$select public.admin_report_groups('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001')$$,'42501',null,'비회원 관리자 RPC 차단');
reset role;
update auth.sessions set not_after=now()-interval '1 second' where id='11400000-0000-0000-0001-000000000001';
set local role service_role;
select throws_ok($$select public.admin_report_groups('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001')$$,'42501','admin_required','만료된 관리자 세션 차단');
reset role;
update auth.sessions set not_after=null where id='11400000-0000-0000-0001-000000000001';
set local role service_role;
select throws_ok($$select * from private.admin_users$$,'42501',null,'서비스 역할도 원본 관리자 테이블 직접 조회 불가');
select throws_ok($$select public.admin_report_groups('11400000-0000-0000-0000-000000000002','11400000-0000-0000-0001-000000000002')$$,'42501','admin_required','등록된 관리자만 조회');
select throws_ok($$select public.admin_report_groups('11400000-0000-0000-0000-000000000001',gen_random_uuid())$$,'42501','admin_required','서명된 사용자라도 존재하지 않는 세션 거부');
select is((public.admin_report_groups('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001')->0->>'report_count')::int,1,'최신 댓글 그룹 신고 수');
select is((public.admin_report_groups('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001')->1->>'report_count')::int,2,'같은 게시글 신고를 묶음');
select is(public.admin_report_detail('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',current_setting('test.comment_report')::bigint)->'report'->>'reported_content','신고 당시 댓글','댓글 신고 Snapshot 보존');
select is(public.admin_report_detail('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',current_setting('test.report')::bigint)->'author'->>'id','11400000-0000-0000-0000-000000000002','운영자에게만 실제 작성자 UUID');
select is(jsonb_array_length(public.admin_report_detail('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',current_setting('test.report')::bigint)->'related_reports'),2,'그룹 안의 개별 신고 사유·상태 조회');
select throws_ok($$select public.admin_content_action('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',gen_random_uuid(),current_setting('test.report')::bigint,'report_status','resolved','spam','확인')$$,'22023','invalid_report_transition','검토 전 바로 처리 완료 불가');
select public.admin_content_action('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001','11400000-0000-0000-0002-000000000001',current_setting('test.report')::bigint,'report_status','reviewing','spam','검토 시작') as status_audit \gset
select is(public.admin_content_action('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001','11400000-0000-0000-0002-000000000001',current_setting('test.report')::bigint,'report_status','reviewing','spam','검토 시작'),:'status_audit','동일 요청 재전송 시 같은 감사 ID');
select throws_ok($$select public.admin_content_action('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001','11400000-0000-0000-0002-000000000001',current_setting('test.report')::bigint,'report_status','rejected','spam','검토 시작')$$,'22023','request_id_conflict','같은 키의 다른 요청 거부');
select lives_ok($$select public.admin_content_action('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',gen_random_uuid(),current_setting('test.report')::bigint,'report_status','resolved','spam','확인 완료')$$,'검토 이후 처리 완료');
select throws_ok($$select public.admin_content_action('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',gen_random_uuid(),current_setting('test.report')::bigint,'hide',null,'spam',' ')$$,'22023','invalid_moderation_reason','빈 상세 사유 거부');
select lives_ok($$select public.admin_content_action('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',gen_random_uuid(),current_setting('test.report')::bigint,'hide',null,'spam','스팸 확인')$$,'운영자 게시글 숨김');
reset role;
select is((select hidden_by::text from private.posts where id=:post_id),'11400000-0000-0000-0000-000000000001','숨김 운영자 기록');
select is((select deleted_at from private.posts where id=:post_id),null::timestamptz,'신고 수나 숨김은 작성자 삭제가 아님');
set local role service_role;
select lives_ok($$select public.admin_content_action('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',gen_random_uuid(),current_setting('test.report')::bigint,'restore',null,'other','재검토 복구')$$,'운영자 숨김만 복구');
reset role;
update private.posts set deleted_at=now() where id=:post_id;
set local role service_role;
select throws_ok($$select public.admin_content_action('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',gen_random_uuid(),current_setting('test.report')::bigint,'restore',null,'other','복구 시도')$$,'22023','deleted_content_cannot_change','작성자가 삭제한 게시글은 복구 불가');
select ok(public.admin_report_detail('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',current_setting('test.report')::bigint)->'post'->>'deleted_at' is not null,'soft delete 원문 운영 조회');
select throws_ok($$select public.admin_prepare_sanction('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',gen_random_uuid(),'11400000-0000-0000-0000-000000000001','warning','abuse','자기 제재')$$,'22023','invalid_sanction','관리자 자기 제재 거부');
reset role;

create function pg_temp.apply_sanction(operation text, request_id uuid) returns jsonb language plpgsql as $$
declare prepared jsonb;
begin
  prepared:=public.admin_prepare_sanction('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',request_id,'11400000-0000-0000-0000-000000000002',operation,'abuse','운영정책 위반 확인');
  update auth.users set raw_app_meta_data=raw_app_meta_data || jsonb_build_object('moderation_request_id',request_id) where id='11400000-0000-0000-0000-000000000002';
  if operation in ('suspended','release') then
    update auth.users set banned_until=case when operation='suspended' then now()+interval '100 years' else null end where id='11400000-0000-0000-0000-000000000002';
  end if;
  set constraints all immediate;
  set constraints all deferred;
  return public.admin_sanction_request('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001',request_id);
end;
$$;
select lives_ok($$select pg_temp.apply_sanction('warning','11400000-0000-0000-0003-000000000001')$$,'경고 적용');
select is((select status::text from public.profiles where id='11400000-0000-0000-0000-000000000002'),'warning','경고는 경고 상태');
select lives_ok($$select private.assert_can_write_community()$$,'경고는 커뮤니티 쓰기 허용');
select ok(public.get_account_access()->>'notice_seen_at' is null,'경고 최초 안내 대기');
select public.acknowledge_sanction_notice((public.get_account_access()->>'sanction_id')::bigint);
select ok(public.get_account_access()->>'notice_seen_at' is not null,'제재 건별 확인 저장');
select throws_ok($$select public.acknowledge_sanction_notice(9223372036854775807)$$,'42501','sanction_not_found','없는 제재 확인 불가');
select lives_ok($$select pg_temp.apply_sanction('community_restricted','11400000-0000-0000-0003-000000000002')$$,'7일 제한 적용');
select is((select restricted_until-now() from public.profiles where id='11400000-0000-0000-0000-000000000002'),interval '168 hours','7 곱하기 24시간 제한');
select throws_ok($$select public.delete_community_post(current_setting('test.post')::bigint)$$,'42501','community_restricted','본인 글 삭제도 제한');
select lives_ok($$select private.assert_can_report_community()$$,'기간 제한 중 신고·차단 허용');
select lives_ok($$select public.get_community_feed()$$,'기간 제한 중 조회 허용');
select ok(public.get_account_access()->>'notice_seen_at' is null,'새 제한 건의 최초 안내는 이전 경고 확인과 별개');
update public.profiles set restricted_until=now()-interval '1 second' where id='11400000-0000-0000-0000-000000000002';
select lives_ok($$select private.assert_can_write_community()$$,'제한 만료 즉시 쓰기 허용');
select is(public.get_account_access()->>'status','active','만료 제재는 앱에도 active 반환');
select lives_ok($$select pg_temp.apply_sanction('suspended','11400000-0000-0000-0003-000000000003')$$,'영구 제한과 Auth ban 원자적 확정');
select is((select count(*)::int from auth.sessions where user_id='11400000-0000-0000-0000-000000000002'),0,'영구 제한 시 모든 세션 삭제');
select ok((select banned_until>now() from auth.users where id='11400000-0000-0000-0000-000000000002'),'Auth 로그인도 ban');
select throws_ok($$select public.update_nickname('새닉네임114')$$,'42501','suspended','미만료 JWT로 비커뮤니티 RPC도 이용 불가');
select throws_ok($$select public.get_community_feed()$$,'42501','suspended','영구 제한 피드 차단');
select throws_ok($$select public.get_community_post(current_setting('test.post')::bigint)$$,'42501','suspended','신고 범위 수정 병합 후에도 정지 계정 상세 차단');
select throws_ok($$select public.get_my_community_activity('liked')$$,'42501','suspended','신고 범위 수정 병합 후에도 정지 계정 활동 차단');
select throws_ok($$select public.report_community_content('post',current_setting('test.post')::bigint,'spam')$$,'42501','suspended','신고 범위 수정 병합 후에도 정지 계정 신고 차단');
set local role authenticated;
select is((select count(*)::int from public.folders),0,'미만료 JWT로 폴더 원본 접근 불가');
select is(public.get_account_access()->>'reason_category','abuse','본인 제재 안내에만 사유 제공');
reset role;
select throws_ok($$update private.admin_actions set reason='이력 변조'$$,'42501','audit_is_append_only','감사 수정 불가');
select throws_ok($$delete from private.admin_actions$$,'42501','audit_is_append_only','감사 삭제 불가');
select throws_ok($$truncate private.admin_actions cascade$$,'42501','audit_is_append_only','감사 truncate 불가');
select lives_ok($$select pg_temp.apply_sanction('release','11400000-0000-0000-0003-000000000004')$$,'운영자 영구 제한 해제');
select is((select status::text from public.profiles where id='11400000-0000-0000-0000-000000000002'),'active','해제 후 active');
select is((select banned_until from auth.users where id='11400000-0000-0000-0000-000000000002'),null::timestamptz,'해제 후 Auth ban 해제');
select throws_ok($$select private.assert_account_access()$$,'42501','not_authorized','해제해도 종료된 이전 세션은 다시 사용할 수 없음');
select throws_ok($$select public.report_community_content('post',current_setting('test.post')::bigint,'spam')$$,'42501','not_authorized','제한 해제 후에도 종료된 세션으로 신고 불가');
update private.admin_users set disabled_at=now() where id='11400000-0000-0000-0000-000000000001';
set local role service_role;
select throws_ok($$select public.admin_report_groups('11400000-0000-0000-0000-000000000001','11400000-0000-0000-0001-000000000001')$$,'42501','admin_required','비활성 관리자 즉시 접근 차단');
reset role;
select * from finish();
rollback;
