begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) values
 ('22400000-0000-0000-0000-000000000001','admin224@test.invalid'),
 ('22400000-0000-0000-0000-000000000002','author224@test.invalid'),
 ('22400000-0000-0000-0000-000000000003','reporter224@test.invalid'),
 ('22400000-0000-0000-0000-000000000004','second224@test.invalid');
insert into auth.sessions(id,user_id) values
 ('22400000-0000-0000-0001-000000000001','22400000-0000-0000-0000-000000000001'),
 ('22400000-0000-0000-0001-000000000002','22400000-0000-0000-0000-000000000002');
insert into private.admin_users(id,email,role) values ('22400000-0000-0000-0000-000000000001','admin224@test.invalid','operator');
insert into private.posts(author_id,type,content)
 select '22400000-0000-0000-0000-000000000002','post','신고 대상 본문 ' || n from generate_series(1,25) n;
insert into private.reports(reporter_id,target_type,post_id,reported_user_id,reason)
 select '22400000-0000-0000-0000-000000000003','post',id,author_id,'abuse' from private.posts where author_id='22400000-0000-0000-0000-000000000002';
select set_config('test.admin224.report',(select min(id)::text from private.reports where reported_user_id='22400000-0000-0000-0000-000000000002'),true);
insert into private.reports(reporter_id,target_type,post_id,reported_user_id,reason)
 select '22400000-0000-0000-0000-000000000004','post',post_id,reported_user_id,'spam' from private.reports where id=current_setting('test.admin224.report')::bigint;

set local role anon;
select throws_ok($$select public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','members')$$,'42501',null,'비회원은 관리자 RPC 직접 실행 불가');
set local role authenticated;
select throws_ok($$select public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','members')$$,'42501',null,'일반 JWT로 관리자 RPC 직접 실행 불가');
select throws_ok($$select * from private.admin_console_access_logs$$,'42501',null,'조회 기록도 직접 접근 불가');
set local role service_role;
select throws_ok($$select public.admin_console('22400000-0000-0000-0000-000000000002','22400000-0000-0000-0001-000000000002','members')$$,'42501','admin_required','일반 회원은 Edge를 거쳐도 차단');
select throws_ok($$select public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000002','members')$$,'42501','admin_required','다른 사람의 세션은 거부');
select is(public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','session')->>'role','operator','서버에서 관리자 권한 확인');
select is(public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','reports')->>'total','25','신고는 콘텐츠별 집계');
select is(jsonb_array_length(public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','reports')->'rows'),20,'첫 페이지 20개');
select is(jsonb_array_length(public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','reports','', 'all','all',2)->'rows'),5,'다음 페이지 나머지 5개');
select is(public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','reports','없는내용')->>'total','0','검색은 전체 데이터에 적용');
select is(public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','reports','', 'all','comment')->>'total','0','댓글 유형 필터');
select throws_ok($$select public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','members','','all','all',0)$$,'22023','invalid_console_query','잘못된 페이지 거부');
select throws_ok($$select public.admin_report_group_status('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001',gen_random_uuid(),current_setting('test.admin224.report')::bigint,'resolved','abuse','확인')$$,'22023','report_state_conflict','접수 신고를 바로 완료할 수 없음');
select lives_ok($$select public.admin_report_group_status('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','22400000-0000-0000-0002-000000000001',current_setting('test.admin224.report')::bigint,'reviewing','abuse','검토 시작')$$,'그룹 전체 검토 시작');
reset role;
select is((select count(*)::integer from private.reports where status='reviewing'),2,'같은 콘텐츠 신고 2건이 함께 변경');
select is((select count(*)::integer from private.admin_actions where request_id='22400000-0000-0000-0002-000000000001'),1,'그룹 조치 감사 기록 1건');
set local role service_role;
select lives_ok($$select public.admin_report_group_status('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','22400000-0000-0000-0002-000000000001',current_setting('test.admin224.report')::bigint,'reviewing','abuse','검토 시작')$$,'같은 요청 재시도 성공');
select throws_ok($$select public.admin_report_group_status('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','22400000-0000-0000-0002-000000000001',current_setting('test.admin224.report')::bigint,'resolved','abuse','검토 시작')$$,'22023','request_id_conflict','같은 ID로 다른 조치 금지');
select lives_ok($$select public.admin_report_group_status('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001',gen_random_uuid(),current_setting('test.admin224.report')::bigint,'resolved','abuse','처리 완료')$$,'검토 중 그룹 완료');
select is(public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','reports','','resolved')->>'total','1','그룹 상태 필터');
select is(public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','report_detail','','all','all',1,current_setting('test.admin224.report')::bigint)->>'report_count','2','상세 총 신고 수');
select is(public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','members')->>'total','4','회원 목록 조회');
select is(public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','sanctions')->>'total','0','빈 제재 목록');
reset role;
select ok((select count(*)>0 from private.admin_console_access_logs),'개인정보 목록 조회 기록 저장');
update auth.sessions set ip='203.0.113.24' where id='22400000-0000-0000-0001-000000000001';
set local role service_role;
select public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','members','','all','all',2);
reset role;
select is((select subject_ids from private.admin_console_access_logs where resource='members' order by id desc limit 1),'{}'::uuid[],'빈 페이지는 조회 대상 없음');
set local role service_role;
select public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','members','22400000-0000-0000-0000-000000000002');
select public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','report_detail','','all','all',1,current_setting('test.admin224.report')::bigint);
reset role;
select is((select session_ip::text from private.admin_console_access_logs where resource='members' order by id desc limit 1),'203.0.113.24/32','검증한 Auth 세션의 로그인 IP 저장');
select is((select subject_ids from private.admin_console_access_logs where resource='members' order by id desc limit 1),array['22400000-0000-0000-0000-000000000002'::uuid],'실제로 반환한 회원만 조회 기록에 저장');
select ok((select subject_ids @> array['22400000-0000-0000-0000-000000000002'::uuid,'22400000-0000-0000-0000-000000000003'::uuid,'22400000-0000-0000-0000-000000000004'::uuid] from private.admin_access_logs order by id desc limit 1),'상세에서 반환한 작성자·신고자 기록');
update private.admin_users set disabled_at=now() where id='22400000-0000-0000-0000-000000000001';
set local role service_role;
select throws_ok($$select public.admin_console('22400000-0000-0000-0000-000000000001','22400000-0000-0000-0001-000000000001','reports')$$,'42501','admin_required','비활성 운영자는 기존 세션으로도 조회 불가');
reset role;
select * from finish();
rollback;
