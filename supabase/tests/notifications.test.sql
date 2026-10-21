begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- A: 글쓴이(알림 수신자), B·C: 다른 사용자
insert into auth.users(id, email) values
 ('10400000-0000-0000-0000-00000000000a','noti-a@test.dev'),
 ('10400000-0000-0000-0000-00000000000b','noti-b@test.dev'),
 ('10400000-0000-0000-0000-00000000000c','noti-c@test.dev');
insert into private.posts(author_id, type, content)
 values ('10400000-0000-0000-0000-00000000000a','post','알림 테스트 일반글');
select set_config('test.post', (select max(id)::text from private.posts), true);
insert into private.posts(author_id, type, content, created_at, ends_at)
 values ('10400000-0000-0000-0000-00000000000a','vote','알림 테스트 진행 투표', now(), now() + interval '24 hours');
select set_config('test.open_vote', (select max(id)::text from private.posts), true);
insert into private.posts(author_id, type, content, created_at, ends_at)
 values ('10400000-0000-0000-0000-00000000000a','vote','알림 테스트 마감 투표',
         now() - interval '25 hours', now() - interval '1 hour');
select set_config('test.ended_vote', (select max(id)::text from private.posts), true);
insert into private.posts(author_id, type, content, created_at, ends_at, deleted_at)
 values ('10400000-0000-0000-0000-00000000000a','vote','알림 테스트 삭제 투표',
         now() - interval '25 hours', now() - interval '1 hour', now() - interval '2 hours');
select set_config('test.deleted_vote', (select max(id)::text from private.posts), true);
-- 마감된 뒤 작업이 돌기 전에 지운 투표
insert into private.posts(author_id, type, content, created_at, ends_at, deleted_at)
 values ('10400000-0000-0000-0000-00000000000a','vote','알림 테스트 마감 후 삭제 투표',
         now() - interval '25 hours', now() - interval '1 hour', now() - interval '30 minutes');
select set_config('test.deleted_after_end_vote', (select max(id)::text from private.posts), true);
insert into private.vote_responses(post_id, user_id, choice) values
 (current_setting('test.ended_vote')::bigint, '10400000-0000-0000-0000-00000000000b', 'buy'),
 (current_setting('test.ended_vote')::bigint, '10400000-0000-0000-0000-00000000000c', 'not');

create function pg_temp.notifications_for(target text)
returns setof private.notifications language sql as $$
  select * from private.notifications
  where recipient_id = '10400000-0000-0000-0000-00000000000a' and type::text = target
$$;

-- NOTI-004 댓글
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select lives_ok($$ select public.create_comment(current_setting('test.post')::bigint, E'좋아\n보여요', 'a0000000-0000-0000-0000-000000000001') $$, '다른 사용자가 댓글을 단다');
select lives_ok($$ select public.create_comment(current_setting('test.post')::bigint, E'좋아\n보여요', 'a0000000-0000-0000-0000-000000000001') $$, '응답을 못 받아 같은 요청으로 다시 보낸다');
select lives_ok($$ select public.create_comment(current_setting('test.open_vote')::bigint, '투표글 댓글', 'a0000000-0000-0000-0000-000000000002') $$, '투표글에 댓글을 단다');
reset role;
select is((select count(*) from pg_temp.notifications_for('post_commented')), 1::bigint, '재시도해도 댓글 알림은 하나고 투표글 댓글은 알리지 않는다');
select is((select body from pg_temp.notifications_for('post_commented')), '디기 1: 좋아 보여요', '익명번호와 한 줄로 바꾼 댓글을 본문에 담는다');
select is((select event_key from pg_temp.notifications_for('post_commented')),
  'comment:' || (select id from private.comments where creation_request_id = 'a0000000-0000-0000-0000-000000000001'), '댓글 id로 이벤트 키를 만든다');

set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select lives_ok($$ select public.create_comment(current_setting('test.post')::bigint, '글쓴이 댓글', 'a0000000-0000-0000-0000-000000000003') $$, '글쓴이가 자기 글에 댓글을 단다');
reset role;
select is((select count(*) from pg_temp.notifications_for('post_commented')), 1::bigint, '본인 댓글은 알리지 않는다');

-- NOTI-005 좋아요
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select lives_ok($$ select public.set_community_like(current_setting('test.post')::bigint, true) $$, '좋아요를 누른다');
select lives_ok($$ select public.set_community_like(current_setting('test.post')::bigint, true) $$, '같은 상태를 다시 보낸다');
select lives_ok($$ select public.set_community_like(current_setting('test.post')::bigint, false) $$, '좋아요를 취소한다');
select lives_ok($$ select public.set_community_like(current_setting('test.post')::bigint, true) $$, '다시 누른다');
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select lives_ok($$ select public.set_community_like(current_setting('test.post')::bigint, true) $$, '글쓴이가 자기 글에 좋아요를 누른다');
reset role;
select is((select count(*) from pg_temp.notifications_for('post_liked')), 1::bigint, '같은 사람·같은 글은 취소 후 다시 눌러도 한 번만, 본인 좋아요는 알리지 않는다');
select is((select body from pg_temp.notifications_for('post_liked')), '''알림 테스트 일반글'' 게시글을 누군가 좋아해요.', '좋아요한 사람을 밝히지 않는다');

-- 받는 사람이 차단한 사용자의 행동은 알리지 않는다
insert into private.user_blocks(blocker_id, blocked_id)
 values ('10400000-0000-0000-0000-00000000000a', '10400000-0000-0000-0000-00000000000c');
insert into private.comments(post_id, author_id, content, creation_request_id)
 values (current_setting('test.post')::bigint, '10400000-0000-0000-0000-00000000000c', '차단된 사람 댓글', 'a0000000-0000-0000-0000-000000000004');
insert into private.post_likes(post_id, user_id) values (current_setting('test.post')::bigint, '10400000-0000-0000-0000-00000000000c');
select is((select count(*) from private.notifications where recipient_id = '10400000-0000-0000-0000-00000000000a' and type <> 'vote_ended'),
  2::bigint, '차단한 사용자의 댓글·좋아요는 알리지 않는다');

-- NOTI-003 투표 마감
select lives_ok($$ select private.create_vote_ended_notifications() $$, '마감 작업이 돈다');
select lives_ok($$ select private.create_vote_ended_notifications() $$, '마감 작업이 다시 돈다');
select is((select array_agg(post_id order by post_id) from pg_temp.notifications_for('vote_ended')),
  array[current_setting('test.ended_vote')::bigint, current_setting('test.deleted_after_end_vote')::bigint],
  '마감 뒤에 지운 투표도 한 번 알리고, 진행 중이거나 마감 전에 지운 투표는 알리지 않는다');
delete from private.notifications where post_id = current_setting('test.deleted_after_end_vote')::bigint;
select is((select body from pg_temp.notifications_for('vote_ended')), '''알림 테스트 마감 투표'' 투표가 종료됐어요. BUY 1 · NOT 1', '최종 집계를 본문에 담는다');

-- NOTI-007 목록
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select is(jsonb_array_length(public.get_notifications()), 3, '내 알림만 최신순으로 받는다');
select is((select array_agg(x->>'type' order by ordinality) from jsonb_array_elements(public.get_notifications()) with ordinality as t(x, ordinality)),
  array['vote_ended', 'post_liked', 'post_commented'], '가장 최근 알림이 먼저 온다');
select ok(not public.get_notifications()::text ~ '10400000-', '응답에 사용자 UUID가 없다');
select is((select count(*) from jsonb_array_elements(public.get_notifications()) x where x ? 'event_key'), 0::bigint, '이벤트 키는 앱에 주지 않는다');

-- 알림함 확인: 처음엔 전부 안 읽음이고, 열면 이전 확인 시각을 돌려주고 점이 꺼진다
select ok(public.has_unread_notifications(), '알림함을 연 적이 없으면 새 알림이 있다');
select is(public.mark_notifications_checked(), null::timestamptz, '처음 열면 이전 확인 시각이 없다');
select ok(not public.has_unread_notifications(), '열고 나면 새 알림이 없다');
reset role;
update private.notification_checks set checked_at = now() - interval '1 minute'
 where user_id = '10400000-0000-0000-0000-00000000000a';
update private.notifications set created_at = now() - interval '2 minutes'
 where recipient_id = '10400000-0000-0000-0000-00000000000a';
insert into private.notifications(recipient_id, type, post_id, title, body, event_key)
 values ('10400000-0000-0000-0000-00000000000a', 'post_liked', current_setting('test.post')::bigint, '새 알림', '본문', 'test:new');
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select ok(public.has_unread_notifications(), '확인 뒤에 온 알림이 있으면 점이 켜진다');
select is(public.mark_notifications_checked(), now() - interval '1 minute', '다시 열면 지난번 확인 시각을 돌려준다');
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select ok(not public.has_unread_notifications(), '남의 알림으로 점이 켜지지 않는다');
reset role;
select is((select count(*) from private.notification_checks where user_id::text like '10400000-%'), 1::bigint, '연 사람의 확인 시각만 남는다');
delete from private.notifications where event_key = 'test:new';
set local role anon;
select throws_ok($$ select public.has_unread_notifications() $$, '42501', null, '비회원은 새 알림 여부를 볼 수 없다');
select throws_ok($$ select public.mark_notifications_checked() $$, '42501', null, '비회원은 확인 처리를 할 수 없다');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select throws_ok($$ select count(*) from private.notification_checks $$, '42501', null, '확인 시각 원본은 직접 읽을 수 없다');

-- MY-011 Push 수신 설정
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select ok(public.get_push_enabled(), '설정한 적 없으면 Push를 받는다');
select is(public.set_push_enabled(false), false, 'Push를 끈다');
select ok(not public.get_push_enabled(), '끈 값이 저장된다');
select throws_ok($$ select public.set_push_enabled(null) $$, '22023', null, '빈 값은 저장하지 않는다');
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select ok(public.get_push_enabled(), '남이 끈 설정은 내 설정에 영향이 없다');
select throws_ok($$ select count(*) from private.notification_settings $$, '42501', null, '설정 원본은 직접 읽을 수 없다');
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select is(public.set_push_enabled(true), true, 'Push를 다시 켠다');
select ok(public.get_push_enabled(), '켠 값이 저장된다');
reset role;
set local role anon;
select throws_ok($$ select public.get_push_enabled() $$, '42501', null, '비회원은 설정을 볼 수 없다');
select throws_ok($$ select public.set_push_enabled(false) $$, '42501', null, '비회원은 설정을 바꿀 수 없다');
reset role;
update private.posts set deleted_at = now() where id = current_setting('test.post')::bigint;
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select is((select bool_and((x->>'is_post_available')::boolean = false) from jsonb_array_elements(public.get_notifications()) x where x->>'type' <> 'vote_ended'),
  true, '글이 지워지면 알림은 남고 열 수 없다고 알려 준다(NOTI-006)');
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is(jsonb_array_length(public.get_notifications()), 0, '남의 알림은 보이지 않는다');
select throws_ok($$ select count(*) from private.notifications $$, '42501', null, '알림 원본은 직접 읽을 수 없다');
select throws_ok($$ select private.create_vote_ended_notifications() $$, '42501', null, '마감 작업은 앱이 실행할 수 없다');
reset role;
set local role anon;
select throws_ok($$ select public.get_notifications() $$, '42501', null, '비회원은 알림을 볼 수 없다');
reset role;

-- 30일 지난 알림은 목록에서 빠지고 정리 작업이 지운다
update private.notifications set created_at = now() - interval '31 days'
 where recipient_id = '10400000-0000-0000-0000-00000000000a' and type = 'post_liked';
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select is(jsonb_array_length(public.get_notifications()), 2, '30일 지난 알림은 목록에서 빠진다');
reset role;
select lives_ok($$ select private.delete_old_notifications() $$, '정리 작업이 돈다');
select is((select count(*) from pg_temp.notifications_for('post_liked')), 0::bigint, '30일 지난 알림을 지운다');
select is((select count(*) from private.like_notification_log where actor_id = '10400000-0000-0000-0000-00000000000b'), 1::bigint,
  '좋아요 기록은 남아 알림을 지워도 다시 보내지 않는다');

select * from finish();
rollback;
