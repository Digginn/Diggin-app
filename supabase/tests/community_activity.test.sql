begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values
 ('99000000-0000-0000-0000-000000000001','activity-me@test.dev'),
 ('99000000-0000-0000-0000-000000000002','activity-other@test.dev'),
 ('99000000-0000-0000-0000-000000000003','activity-empty@test.dev');
insert into private.posts(author_id,type,content,created_at)
 select '99000000-0000-0000-0000-000000000001','post','본인 게시글 테스트','2026-01-01' from generate_series(1,25);
insert into private.posts(author_id,type,content,ends_at) values
 ('99000000-0000-0000-0000-000000000001','vote','본인 투표글 테스트',now()+interval '24 hours');
select set_config('test.vote',(select max(id)::text from private.posts),true);
insert into private.posts(author_id,type,content,created_at)
 select '99000000-0000-0000-0000-000000000002','post','다른 사람 게시글 테스트','2025-01-01' from generate_series(1,25);
select set_config('test.other',(select max(id)::text from private.posts),true);
insert into private.post_likes(post_id,user_id,created_at)
 select id,'99000000-0000-0000-0000-000000000001','2026-01-02' from private.posts where author_id='99000000-0000-0000-0000-000000000002' order by id desc;
-- 글 ID와 좋아요 ID의 순서가 반대이며 모든 시각이 같아도 페이지 누락이 없어야 한다.
set local role anon;
select throws_ok($$select public.get_my_community_activity('post')$$,'42501',null,'비회원 활동 조회 차단');
set local role authenticated;
select throws_ok($$select public.get_my_community_activity('post')$$,'42501','not_authenticated','JWT 없는 활동 조회 차단');
set local request.jwt.claims='{"sub":"99000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(jsonb_array_length(public.get_my_community_activity('post')),20,'본인 일반글 첫 페이지 20개');
select is(jsonb_array_length(public.get_my_community_activity('vote')),1,'본인 투표만 별도 조회');
select is(public.get_my_community_activity('vote')->0->'post'->>'id',current_setting('test.vote'),'투표 상세 ID 반환');
select ok(not (public.get_my_community_activity('post')->0->'post' ? 'author_id'),'본인 목록에도 원본 UUID 비공개');
select is(public.get_my_community_activity('post')->0->'post'->>'is_mine','true','글쓴이 본인 상태');
select set_config('test.page',public.get_my_community_activity('post')::text,true);
select is(jsonb_array_length(public.get_my_community_activity('post',
 (current_setting('test.page')::jsonb->19->>'activity_at')::timestamptz,
 (current_setting('test.page')::jsonb->19->>'activity_id')::bigint)),5,'같은 작성 시각도 다음 5개만 조회');
select is(jsonb_array_length(public.get_my_community_activity('liked')),20,'좋아요 첫 페이지 20개');
select set_config('test.liked',public.get_my_community_activity('liked')::text,true);
select is(jsonb_array_length(public.get_my_community_activity('liked',
 (current_setting('test.liked')::jsonb->19->>'activity_at')::timestamptz,
 (current_setting('test.liked')::jsonb->19->>'activity_id')::bigint)),5,'좋아요 ID 커서로 다음 5개 조회');
select is(public.get_my_community_activity('liked')->0->'post'->>'is_liked','true','유효한 좋아요 상태 반환');
select throws_ok($$select public.get_my_community_activity('all')$$,'22023','invalid_activity_cursor','정해진 활동 종류만 허용');
select throws_ok($$select public.get_my_community_activity(null)$$,'22023','invalid_activity_cursor','빈 활동 종류 차단');
select throws_ok($$select public.get_my_community_activity('post',now(),null)$$,'22023','invalid_activity_cursor','불완전 커서 차단');
select throws_ok($$select public.get_my_community_activity('post',now(),0)$$,'22023','invalid_activity_cursor','유효하지 않은 ID 차단');
select throws_ok($$select public.get_my_community_activity('post','infinity',1)$$,'22023','invalid_activity_cursor','유한하지 않은 커서 차단');
reset role;
select is((select count(*) from jsonb_array_elements(public.get_my_community_activity('post')) a where a->'post'->>'is_mine'='false'),0::bigint,'타인 글은 본인 목록에 섞이지 않는다');
-- 위 검사는 인증 클레임이 유지된 postgres 함수 호출에서도 본인 범위만 확인한다.
select set_config('test.expected', (select post_id::text from private.post_likes where user_id='99000000-0000-0000-0000-000000000001' order by created_at desc,id desc limit 1),true);
set local role authenticated;
select is(public.get_my_community_activity('liked')->0->'post'->>'id',current_setting('test.expected'),'글 작성일이 아닌 좋아요 활동순 정렬');
select lives_ok(format('select public.set_community_like(%s,false)',current_setting('test.expected')),'좋아요 취소');
reset role;
select is((select count(*) from jsonb_array_elements(public.get_my_community_activity('liked')) a where a->'post'->>'id'=current_setting('test.expected')),0::bigint,'취소한 좋아요는 즉시 제외');
set local role authenticated;
select lives_ok(format('select public.set_community_like(%s,true)',current_setting('test.expected')),'취소 후 재등록');
select is(public.get_my_community_activity('liked')->0->'post'->>'id',current_setting('test.expected'),'재등록은 새 활동으로 최상단');
reset role;
update private.posts set deleted_at=now() where id=current_setting('test.expected')::bigint;
select is((select count(*) from jsonb_array_elements(public.get_my_community_activity('liked')) a where a->'post'->>'id'=current_setting('test.expected')),0::bigint,'삭제 글 좋아요 제외');
update private.posts set deleted_at=null,hidden_at=now() where id=current_setting('test.expected')::bigint;
select is((select count(*) from jsonb_array_elements(public.get_my_community_activity('liked')) a where a->'post'->>'id'=current_setting('test.expected')),0::bigint,'숨김 글 좋아요 제외');
update private.posts set hidden_at=null where id=current_setting('test.expected')::bigint;
insert into private.user_blocks(blocker_id,blocked_id) values ('99000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000002');
select is(jsonb_array_length(public.get_my_community_activity('liked')),0,'차단 작성자 좋아요 제외');
delete from private.user_blocks where blocker_id='99000000-0000-0000-0000-000000000001';
insert into private.reports(reporter_id,target_type,post_id,reported_user_id,reason) values
 ('99000000-0000-0000-0000-000000000001','post',current_setting('test.other')::bigint,'99000000-0000-0000-0000-000000000002','spam');
select is((select count(*) from jsonb_array_elements(public.get_my_community_activity('liked')) a where a->'post'->>'id'=current_setting('test.other')),0::bigint,'신고한 게시글을 좋아요 목록에서 제외');
select is(jsonb_array_length(public.get_my_community_activity('liked')),20,'같은 작성자의 다른 좋아요 게시글은 유지');
set local request.jwt.claims='{"sub":"99000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select is(jsonb_array_length(public.get_my_community_activity('post')),0,'빈 계정은 다른 사람의 글을 볼 수 없다');
select is(jsonb_array_length(public.get_my_community_activity('liked')),0,'빈 계정은 다른 사람의 좋아요를 볼 수 없다');
reset role;
update public.profiles set status='community_restricted',restricted_until=now()+interval '7 days' where id='99000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"99000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(jsonb_array_length(public.get_my_community_activity('post')),20,'커뮤니티 작성 제한 중 조회 허용');
select throws_ok($$select public.delete_community_post(current_setting('test.vote')::bigint)$$,'42501','community_restricted','기간 제한 중 본인 글 삭제 차단');
reset role;
update public.profiles set restricted_until=now()-interval '1 second' where id=auth.uid();
set local role authenticated;
select lives_ok($$select public.delete_community_post(current_setting('test.vote')::bigint)$$,'제한 만료 후 본인 글 삭제 흐름 재사용');
select is(jsonb_array_length(public.get_my_community_activity('vote')),0,'삭제한 본인 투표는 목록에서 제외');
reset role;
update public.profiles set status='suspended',suspended_at=now() where id='99000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select public.get_my_community_activity('post')$$,'42501','suspended','정지 계정 조회 차단');
reset role;
select * from finish();
rollback;
