begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('22900000-0000-0000-0000-000000000001','admin229@test.invalid'),
 ('22900000-0000-0000-0000-000000000002','member229@test.invalid');
insert into private.admin_users(id,email,role) values ('22900000-0000-0000-0000-000000000001','admin229@test.invalid','operator');
insert into auth.sessions(id,user_id) values
 ('22900000-0000-0000-0001-000000000001','22900000-0000-0000-0000-000000000001'),
 ('22900000-0000-0000-0001-000000000002','22900000-0000-0000-0000-000000000002');
set local role anon;
select is(public.get_featured_notice(),null::jsonb,'공지가 없으면 null');
select throws_ok($$select public.admin_notice(null,null,'list')$$,'42501',null,'비회원 관리자 RPC 차단');
reset role;
set local role authenticated;
set local request.jwt.claims='{"sub":"22900000-0000-0000-0000-000000000002","role":"authenticated","session_id":"22900000-0000-0000-0001-000000000002"}';
select throws_ok($$select public.admin_notice('22900000-0000-0000-0000-000000000001','22900000-0000-0000-0001-000000000001','list')$$,'42501',null,'회원이 관리자를 사칭해도 실행 권한 없음');
select throws_ok($$select * from private.notice_requests$$,'42501',null,'멱등 기록 직접 접근 차단');
reset role;
set local role service_role;
select throws_ok($$select public.admin_notice('22900000-0000-0000-0000-000000000002','22900000-0000-0000-0001-000000000002','list')$$,'42501','admin_required','서버에서도 일반 회원 차단');
select set_config('test.notice_id',(public.admin_notice('22900000-0000-0000-0000-000000000001','22900000-0000-0000-0001-000000000001','create',null,'22900000-0000-0000-0002-000000000001',
  jsonb_build_object('title','새 공지','body',repeat('내용입니다. ',100),'inbox_body','알림함 요약','inbox_only',false,'comments_closed',false))->>'id'),true);
select is(public.admin_notice('22900000-0000-0000-0000-000000000001','22900000-0000-0000-0001-000000000001','create',null,'22900000-0000-0000-0002-000000000001',
  jsonb_build_object('title','새 공지','body',repeat('내용입니다. ',100),'inbox_body','알림함 요약','inbox_only',false,'comments_closed',false))->>'id',current_setting('test.notice_id'),'응답 유실 재시도는 같은 공지');
select throws_ok($$select public.admin_notice('22900000-0000-0000-0000-000000000001','22900000-0000-0000-0001-000000000001','create',null,'22900000-0000-0000-0002-000000000001','{}')$$,'P0001','notice_request_conflict','동일 UUID에 다른 본문 거부');
select is(public.admin_notice('22900000-0000-0000-0000-000000000001','22900000-0000-0000-0001-000000000001','list')->>'total','1','상품 없이 긴 본문의 공지 생성');
reset role;
set local role authenticated;
select is(public.get_featured_notice()->>'id',current_setting('test.notice_id'),'피드 공지 연결');
select is(jsonb_array_length(public.get_community_feed()),0,'일반 게시글 목록과 분리');
select is(public.get_community_post(current_setting('test.notice_id')::bigint)->'notice'->>'title','새 공지','공지 상세 제목');
select is(public.get_app_notifications()->0->>'post_type','notice','알림함 공지는 같은 상세로 연결');
select is(public.get_app_notifications()->0->>'body','알림함 요약','알림함 요약 반영');
select ok(public.has_unread_notices(),'미확인 공지 점');
select lives_ok($$select public.mark_notifications_checked()$$,'공지 알림 확인');
select ok(not public.has_unread_notices(),'확인 후 점 제거');
select lives_ok($$select public.set_community_like(current_setting('test.notice_id')::bigint,true)$$,'공지 좋아요');
select set_config('test.comment_id',(public.create_comment(current_setting('test.notice_id')::bigint,repeat('가',150),'22900000-0000-0000-0003-000000000001')->>'id'),true);
select is(jsonb_array_length(public.get_community_comments(current_setting('test.notice_id')::bigint)),1,'공지 댓글 150자');
reset role;
set local request.jwt.claims='{"sub":"22900000-0000-0000-0000-000000000001","role":"authenticated","session_id":"22900000-0000-0000-0001-000000000001"}';
set local role authenticated;
select set_config('test.operator_comment_id',(public.create_comment(current_setting('test.notice_id')::bigint,'운영자 댓글',gen_random_uuid())->>'id'),true);
reset role;
set local request.jwt.claims='{"sub":"22900000-0000-0000-0000-000000000002","role":"authenticated","session_id":"22900000-0000-0000-0001-000000000002"}';
set local role authenticated;
select throws_ok($$select public.report_community_content('post',current_setting('test.notice_id')::bigint,'spam')$$,'42501','operator_content_protected','활성 운영자 공지 신고 차단');
select throws_ok($$select public.block_community_author('post',current_setting('test.notice_id')::bigint)$$,'42501','operator_content_protected','활성 운영자 공지 작성자 차단 거부');
select throws_ok($$select public.report_community_content('comment',current_setting('test.operator_comment_id')::bigint,'spam')$$,'42501','operator_content_protected','활성 운영자 댓글 신고 차단');
select throws_ok($$select public.block_community_author('comment',current_setting('test.operator_comment_id')::bigint)$$,'42501','operator_content_protected','활성 운영자 댓글 작성자 차단 거부');
reset role;
insert into private.user_blocks(blocker_id,blocked_id) values('22900000-0000-0000-0000-000000000002','22900000-0000-0000-0000-000000000001');
insert into private.reports(reporter_id,target_type,post_id,reported_user_id,reason)
values('22900000-0000-0000-0000-000000000002','post',current_setting('test.notice_id')::bigint,'22900000-0000-0000-0000-000000000001','spam');
set local role authenticated;
select is(public.get_featured_notice()->>'id',current_setting('test.notice_id'),'과거 운영자 신고·차단이 있어도 피드 공지 표시');
select is(jsonb_array_length(public.get_app_notifications()),1,'과거 운영자 신고·차단이 있어도 알림함 공지 표시');
select ok(public.get_community_post(current_setting('test.notice_id')::bigint) is not null,'과거 운영자 신고·차단이 있어도 공지 상세 조회');
select throws_ok($$select public.report_community_content('post',current_setting('test.notice_id')::bigint,'spam')$$,'42501','operator_content_protected','과거 신고의 재시도도 운영자 보호 적용');
select throws_ok($$select public.block_community_author('post',current_setting('test.notice_id')::bigint)$$,'42501','operator_content_protected','과거 신고 경로로 운영자 차단 불가');
reset role;
delete from private.notification_checks where user_id='22900000-0000-0000-0000-000000000002';
set local role authenticated;
select ok(public.has_unread_notices(),'과거 차단이 있어도 새 공지의 미확인 점 표시');
reset role;
delete from private.user_blocks where blocker_id='22900000-0000-0000-0000-000000000002';
select is((select count(*)::int from private.notifications where post_id=current_setting('test.notice_id')::bigint),0,'공지 상호작용은 휴대폰 푸시를 생성하지 않음');
set local role service_role;
select lives_ok($$select public.admin_notice('22900000-0000-0000-0000-000000000001','22900000-0000-0000-0001-000000000001','update',current_setting('test.notice_id')::bigint,'22900000-0000-0000-0002-000000000002',
  '{"title":"수정 공지","body":"짧은 본문","inbox_body":"","inbox_only":true,"comments_closed":true,"revision":1}')$$,'공지 수정');
select throws_ok($$select public.admin_notice('22900000-0000-0000-0000-000000000001','22900000-0000-0000-0001-000000000001','visibility',current_setting('test.notice_id')::bigint,'22900000-0000-0000-0002-000000000003','{"revision":1,"is_visible":false}')$$,'P0001','notice_revision_conflict','오래된 편집 화면 덮어쓰기 방지');
reset role;
set local role authenticated;
select is(public.get_featured_notice(),null::jsonb,'알림함 전용 공지는 피드에서 제외');
select is(public.get_app_notifications()->0->>'title','수정 공지','수정 즉시 알림함 반영');
select is(public.get_app_notifications()->0->>'body','짧은 본문','빈 요약은 본문으로 대체');
select is(jsonb_array_length(public.get_community_comments(current_setting('test.notice_id')::bigint)),0,'댓글 닫으면 기존 댓글 숨김');
select throws_ok($$select public.create_comment(current_setting('test.notice_id')::bigint,'새 댓글','22900000-0000-0000-0003-000000000002')$$,'P0001','notice_comments_closed','닫힌 공지 댓글 작성 차단');
select throws_ok($$select public.update_comment(current_setting('test.comment_id')::bigint,'수정 댓글')$$,'P0001','notice_comments_closed','닫힌 공지 댓글 수정 차단');
reset role;
set local role service_role;
select lives_ok($$select public.admin_notice('22900000-0000-0000-0000-000000000001','22900000-0000-0000-0001-000000000001','visibility',current_setting('test.notice_id')::bigint,'22900000-0000-0000-0002-000000000004','{"revision":2,"is_visible":false}')$$,'공지 숨기기');
reset role;
set local role authenticated;
select is(jsonb_array_length(public.get_app_notifications()),0,'숨긴 공지는 알림함에서 제외');
select is(public.get_community_post(current_setting('test.notice_id')::bigint),null::jsonb,'숨긴 공지 직접 접근 차단');
reset role;
set local role service_role;
select lives_ok($$select public.admin_notice('22900000-0000-0000-0000-000000000001','22900000-0000-0000-0001-000000000001','delete',current_setting('test.notice_id')::bigint,'22900000-0000-0000-0002-000000000005','{"revision":3}')$$,'공지 삭제');
select is(public.admin_notice('22900000-0000-0000-0000-000000000001','22900000-0000-0000-0001-000000000001','list')->>'total','0','삭제 공지는 관리자 목록에서 제외');
reset role;
-- 같은 시각의 공지와 개인 알림을 합쳐도 커서 페이지에서 빠지거나 중복되지 않는다.
do $$ begin
  for i in 1..21 loop
    perform private.admin_notice('22900000-0000-0000-0000-000000000001','22900000-0000-0000-0001-000000000001','create',null,gen_random_uuid(),
      jsonb_build_object('title','페이지 공지 '||i,'body','본문','inbox_body','','inbox_only',false,'comments_closed',false));
  end loop;
end; $$;
with post as (insert into private.posts(author_id,type,content) values('22900000-0000-0000-0000-000000000001','post','일반 게시글 본문') returning id)
insert into private.notifications(recipient_id,type,post_id,title,body,event_key)
select '22900000-0000-0000-0000-000000000002','post_commented',id,'기존 알림','일반 알림 본문','229-mixed-pagination' from post;
set local role authenticated;
select set_config('test.first_page',public.get_app_notifications()::text,true);
select set_config('test.second_page',public.get_app_notifications(
  (current_setting('test.first_page')::jsonb->19->>'created_at')::timestamptz,
  current_setting('test.first_page')::jsonb->19->>'id')::text,true);
select is(jsonb_array_length(current_setting('test.first_page')::jsonb),20,'혼합 알림 첫 페이지 20건');
select is(jsonb_array_length(current_setting('test.second_page')::jsonb),2,'혼합 알림 다음 페이지 나머지 2건');
select is((select count(distinct entry->>'id')::int from jsonb_array_elements(current_setting('test.first_page')::jsonb||current_setting('test.second_page')::jsonb) entry),22,'동률 커서 중복·누락 없음');
select is(jsonb_array_length(public.get_notifications()),1,'기존 앱 알림 계약은 공지 없이 유지');
reset role;
select set_config('test.ordinary_operator_post',(select id::text from private.posts where author_id='22900000-0000-0000-0000-000000000001' and notice_title is null limit 1),true);
update private.admin_users set disabled_at=now() where id='22900000-0000-0000-0000-000000000001';
set local role authenticated;
select lives_ok($$select public.report_community_content('post',current_setting('test.ordinary_operator_post')::bigint,'spam')$$,'비활성 운영자는 기존 일반 신고 규칙 적용');
select lives_ok($$select public.block_community_author('post',current_setting('test.ordinary_operator_post')::bigint)$$,'비활성 운영자는 기존 일반 차단 규칙 적용');
reset role;
select * from finish();
rollback;
