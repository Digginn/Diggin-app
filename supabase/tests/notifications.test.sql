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
select is((select body from pg_temp.notifications_for('post_commented')), (select nickname from public.profiles where id='10400000-0000-0000-0000-00000000000b') || ': 좋아 보여요', '닉네임과 한 줄로 바꾼 댓글을 본문에 담는다');
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
select throws_ok($$ select public.set_community_like(current_setting('test.post')::bigint, true) $$, '42501', 'own_post_like', '글쓴이는 자기 글에 좋아요를 누를 수 없다');
reset role;
select is((select count(*) from pg_temp.notifications_for('post_liked')), 0::bigint, '좋아요가 10개가 안 되면 알리지 않는다');
insert into auth.users(id, email) select ('10400000-0000-0000-0001-00000000000' || n)::uuid, 'noti-like' || n || '@test.dev' from generate_series(1, 9) n;
insert into private.post_likes(post_id, user_id) select current_setting('test.post')::bigint, ('10400000-0000-0000-0001-00000000000' || n)::uuid from generate_series(1, 8) n;
select is((select count(*) from pg_temp.notifications_for('post_liked')), 0::bigint, '9개까지는 알리지 않는다');
insert into private.post_likes(post_id, user_id) values (current_setting('test.post')::bigint, '10400000-0000-0000-0001-000000000009');
select is((select count(*) from pg_temp.notifications_for('post_liked')), 1::bigint, '10개가 되면 한 번 알린다');
delete from private.post_likes where user_id = '10400000-0000-0000-0001-000000000009';
insert into private.post_likes(post_id, user_id) values (current_setting('test.post')::bigint, '10400000-0000-0000-0001-000000000009');
select is((select count(*) from pg_temp.notifications_for('post_liked')), 1::bigint, '취소 후 다시 10개가 돼도 한 번만 알린다');
select is((select title || ' / ' || body || ' / ' || coalesce(actor_id::text, 'null') from pg_temp.notifications_for('post_liked')),
  '내 게시글에 10개 이상의 좋아요가 달렸어요. / ''알림 테스트 일반글'' 게시글에 달린 좋아요를 확인해 보세요. / null', '좋아요한 사람 없이 글 앞부분과 안내 문장을 담는다');
-- 20자를 넘는 글은 앞 20자 뒤에 ...을 붙이고, 줄바꿈은 공백으로 바꾼다.
insert into private.posts(author_id, type, content)
 values ('10400000-0000-0000-0000-00000000000a', 'post', E'둘 다 너무 예뻐서\n고민 중이에요 어떤 게 나을까요');
insert into private.post_likes(post_id, user_id)
 select (select max(id) from private.posts), ('10400000-0000-0000-0001-00000000000' || n)::uuid from generate_series(1, 9) n
 union all select (select max(id) from private.posts), '10400000-0000-0000-0000-00000000000b';
select is((select body from private.notifications where post_id = (select max(id) from private.posts)),
  '''둘 다 너무 예뻐서 고민 중이에요 어...'' 게시글에 달린 좋아요를 확인해 보세요.', '20자를 넘는 글은 ...으로 줄인다');
-- 30일이 지나 알림이 지워진 뒤 다시 10개가 돼도 발송 이력으로 다시 보내지 않는다.
delete from private.notifications where post_id = (select max(id) from private.posts);
delete from private.post_likes where post_id = (select max(id) from private.posts) and user_id = '10400000-0000-0000-0000-00000000000b';
insert into private.post_likes(post_id, user_id) values ((select max(id) from private.posts), '10400000-0000-0000-0000-00000000000b');
select is((select count(*) from private.notifications where post_id = (select max(id) from private.posts)), 0::bigint,
  '알림이 지워진 뒤 다시 10개가 돼도 게시글당 한 번만 보낸다');
delete from private.notifications where post_id = (select max(id) from private.posts);
delete from private.posts where id = (select max(id) from private.posts);
select is(private.notification_excerpt('고민 중이에요ㅋㅋㅋ', 8), '고민 중이에요ㅋ...', '한글 자모는 이모지로 보지 않는다');
-- 20자째에 이모지가 걸리면 그 이모지부터 자른다.
insert into private.posts(author_id, type, content)
 values ('10400000-0000-0000-0000-00000000000a', 'post', '가나다라마바사아자차카타파하가나다라마👍🏻 이거 어때요');
insert into private.post_likes(post_id, user_id)
 select (select max(id) from private.posts), ('10400000-0000-0000-0001-00000000000' || n)::uuid from generate_series(1, 9) n
 union all select (select max(id) from private.posts), '10400000-0000-0000-0000-00000000000b';
select is((select body from private.notifications where post_id = (select max(id) from private.posts)),
  '''가나다라마바사아자차카타파하가나다라마...'' 게시글에 달린 좋아요를 확인해 보세요.', '경계에 걸린 이모지는 빼고 자른다');
delete from private.notifications where post_id = (select max(id) from private.posts);
delete from private.posts where id = (select max(id) from private.posts);

-- 받는 사람이 차단한 사용자의 행동은 알리지 않는다
insert into private.user_blocks(blocker_id, blocked_id)
 values ('10400000-0000-0000-0000-00000000000a', '10400000-0000-0000-0000-00000000000c');
insert into private.comments(post_id, author_id, content, creation_request_id)
 values (current_setting('test.post')::bigint, '10400000-0000-0000-0000-00000000000c', '차단된 사람 댓글', 'a0000000-0000-0000-0000-000000000004');
insert into private.post_likes(post_id, user_id) values (current_setting('test.post')::bigint, '10400000-0000-0000-0000-00000000000c');
select is((select count(*) from private.notifications where recipient_id = '10400000-0000-0000-0000-00000000000a' and type <> 'vote_ended'),
  2::bigint, '차단한 사용자의 댓글은 알리지 않고 11번째 좋아요도 알리지 않는다');

-- NOTI-003 투표 마감
select lives_ok($$ select private.create_vote_ended_notifications() $$, '마감 작업이 돈다');
select lives_ok($$ select private.create_vote_ended_notifications() $$, '마감 작업이 다시 돈다');
select is((select array_agg(post_id order by post_id) from pg_temp.notifications_for('vote_ended')),
  array[current_setting('test.ended_vote')::bigint],
  '마감된 투표만 한 번 알리고, 진행 중이거나 알림 전에 지운 투표는 마감 뒤에 지웠어도 알리지 않는다');
select is((select body from pg_temp.notifications_for('vote_ended')), '''알림 테스트 마감 투표'' 투표가 종료됐어요. BUY 1 · NOT 1', '최종 집계를 본문에 담는다');

-- NOTI-007 목록
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select is(jsonb_array_length(public.get_notifications()), 3, '내 알림만 최신순으로 받는다');
select is((select array_agg(x->>'type' order by ordinality) from jsonb_array_elements(public.get_notifications()) with ordinality as t(x, ordinality)),
  array['vote_ended', 'post_liked', 'post_commented'], '가장 최근 알림이 먼저 온다');
select ok(not public.get_notifications()::text ~ '10400000-', '응답에 사용자 UUID가 없다');
select is((select count(*) from jsonb_array_elements(public.get_notifications()) x where x ? 'event_key'), 0::bigint, '이벤트 키는 앱에 주지 않는다');

-- 알림을 받은 뒤 차단·신고한 사람의 알림은 목록과 새 알림 점에서 뺀다
reset role;
select is((select count(*) from private.notifications where recipient_id = '10400000-0000-0000-0000-00000000000a'
  and actor_id = '10400000-0000-0000-0000-00000000000b'), 1::bigint, '댓글 알림에만 행동한 사람을 남긴다');
savepoint before_block;
insert into private.user_blocks(blocker_id, blocked_id)
 values ('10400000-0000-0000-0000-00000000000a', '10400000-0000-0000-0000-00000000000b');
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select is((select array_agg(x->>'type') from jsonb_array_elements(public.get_notifications()) x), array['vote_ended', 'post_liked'],
  '차단한 사람의 알림은 목록에서 빠지고 행동한 사람이 없는 투표 마감·좋아요 10개 알림은 남는다');
reset role;
update private.notifications set created_at = now() - interval '1 minute'
 where recipient_id = '10400000-0000-0000-0000-00000000000a' and type = 'vote_ended';
insert into private.notification_checks(user_id, checked_at) values ('10400000-0000-0000-0000-00000000000a', now());
update private.notifications set created_at = now() + interval '1 minute'
 where recipient_id = '10400000-0000-0000-0000-00000000000a' and actor_id = '10400000-0000-0000-0000-00000000000b';
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select ok(not public.has_unread_notifications(), '차단한 사람의 새 알림으로는 점이 켜지지 않는다');
rollback to savepoint before_block;
savepoint before_report;
insert into private.reports(reporter_id, target_type, post_id, reported_user_id, reason)
 values ('10400000-0000-0000-0000-00000000000a', 'post', current_setting('test.post')::bigint, '10400000-0000-0000-0000-00000000000b', 'abuse');
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select is((select array_agg(x->>'type') from jsonb_array_elements(public.get_notifications()) x), array['vote_ended', 'post_liked'],
  '신고한 사람의 알림도 목록에서 빠진다');
rollback to savepoint before_report;
set local role authenticated;
set local request.jwt.claims = '{"sub": "10400000-0000-0000-0000-00000000000a", "role": "authenticated"}';

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

select ok(not has_table_privilege('authenticated', 'private.post_like_notifications', 'SELECT')
  and not has_table_privilege('anon', 'private.post_like_notifications', 'INSERT'), '앱은 좋아요 알림 발송 이력에 접근하지 못한다');
select * from finish();
rollback;
