begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- A: 받는 사람(토큰 2개), B: 댓글·좋아요를 한 사람, C: Push를 끈 사람, D: 토큰이 없는 사람, E: 정지된 사람
insert into auth.users(id, email) values
 ('13900000-0000-0000-0000-00000000000a','push-a@test.dev'),
 ('13900000-0000-0000-0000-00000000000b','push-b@test.dev'),
 ('13900000-0000-0000-0000-00000000000c','push-c@test.dev'),
 ('13900000-0000-0000-0000-00000000000d','push-d@test.dev'),
 ('13900000-0000-0000-0000-00000000000e','push-e@test.dev');
update public.profiles set status = 'suspended', suspended_at = now() where id = '13900000-0000-0000-0000-00000000000e';
insert into public.push_tokens(user_id, token, platform) values
 ('13900000-0000-0000-0000-00000000000a','ExponentPushToken[a-ios]','ios'),
 ('13900000-0000-0000-0000-00000000000a','ExponentPushToken[a-android]','android'),
 ('13900000-0000-0000-0000-00000000000c','ExponentPushToken[c]','ios'),
 ('13900000-0000-0000-0000-00000000000e','ExponentPushToken[e]','ios');
insert into private.notification_settings(user_id, push_enabled) values ('13900000-0000-0000-0000-00000000000c', false);

insert into private.posts(author_id, type, content)
 values ('13900000-0000-0000-0000-00000000000a','post', E'좋아요 받을\n글');
select set_config('test.post', (select max(id)::text from private.posts), true);
insert into private.posts(author_id, type, content, created_at, ends_at)
 values ('13900000-0000-0000-0000-00000000000a','vote','푸시 테스트 마감 투표', now() - interval '25 hours', now() - interval '1 hour');
select set_config('test.vote', (select max(id)::text from private.posts), true);

create function pg_temp.notify(recipient text, kind text, post text, actor text, key text, created interval default '0')
returns void language sql as $$
  insert into private.notifications(recipient_id, type, post_id, actor_id, title, body, event_key, created_at)
  values (recipient::uuid, kind::public.notification_type, current_setting(post)::bigint, actor::uuid,
          case kind when 'vote_ended' then '투표 결과가 나왔어요.' when 'post_liked' then '내 게시글에 좋아요가 달렸어요.'
            else '내 게시글에 댓글이 달렸어요.' end,
          case kind when 'post_commented' then '디기 1: 댓글' else '목록 본문' end,
          key, now() - created);
$$;
select pg_temp.notify('13900000-0000-0000-0000-00000000000a','vote_ended','test.vote',null,'t:vote', '3 minutes');
select pg_temp.notify('13900000-0000-0000-0000-00000000000a','post_commented','test.post','13900000-0000-0000-0000-00000000000b','t:comment', '2 minutes');
select pg_temp.notify('13900000-0000-0000-0000-00000000000a','post_liked','test.post','13900000-0000-0000-0000-00000000000b','t:like', '1 minute');
select pg_temp.notify('13900000-0000-0000-0000-00000000000a','post_commented','test.post','13900000-0000-0000-0000-00000000000b','t:stale', '25 hours');
select pg_temp.notify('13900000-0000-0000-0000-00000000000c','post_commented','test.post','13900000-0000-0000-0000-00000000000b','t:off');
select pg_temp.notify('13900000-0000-0000-0000-00000000000d','post_commented','test.post','13900000-0000-0000-0000-00000000000b','t:no-token');
select pg_temp.notify('13900000-0000-0000-0000-00000000000e','post_commented','test.post','13900000-0000-0000-0000-00000000000b','t:suspended');

create function pg_temp.sent(key text) returns boolean language sql as $$
  select push_sent_at is not null from private.notifications where event_key = key
$$;

-- 권한: 앱 사용자·비회원은 발송 RPC를 부를 수 없고, Vault를 읽는 호출 함수는 서비스 키로도 부를 수 없다.
set local role authenticated;
set local request.jwt.claims = '{"sub": "13900000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select throws_ok($$ select public.claim_push_notifications() $$, '42501', null, '로그인 사용자는 발송 대상을 가져갈 수 없다');
select throws_ok($$ select public.complete_push_notifications('{}', '{ExponentPushToken[c]}') $$, '42501', null, '로그인 사용자는 다른 사람 토큰을 지울 수 없다');
reset role;
set local role anon;
select throws_ok($$ select public.claim_push_notifications() $$, '42501', null, '비회원은 발송 대상을 가져갈 수 없다');
reset role;
set local role service_role;
select throws_ok($$ select private.invoke_push_send() $$, '42501', null, '서비스 키로도 Vault를 읽는 호출 함수는 부를 수 없다');
select throws_ok($$ select public.claim_push_notifications(0) $$, '22023', null, '가져갈 개수는 1~500이다');

select set_config('test.claimed', public.claim_push_notifications()::text, true);
reset role;

select is(jsonb_array_length(current_setting('test.claimed')::jsonb), 3, '보낼 수 있는 알림 3개만 오래된 순으로 가져간다');
select is((select jsonb_agg(c->>'title') from jsonb_array_elements(current_setting('test.claimed')::jsonb) c),
  '["투표가 종료됐어요.", "내 게시글에 댓글이 달렸어요.", "내 게시글에 좋아요가 달렸어요."]'::jsonb, 'Push 제목은 시안 NOTI-03~05를 따른다');
select is((select jsonb_agg(c->>'body') from jsonb_array_elements(current_setting('test.claimed')::jsonb) c),
  '["내 투표 결과를 확인해 보세요.", "디기 1: 댓글", "좋아요 받을 글"]'::jsonb, '투표 마감은 고정 문구, 댓글은 목록 본문, 좋아요는 한 줄로 바꾼 게시글 본문');
select is(current_setting('test.claimed')::jsonb->0->'tokens',
  '["ExponentPushToken[a-ios]", "ExponentPushToken[a-android]"]'::jsonb, '받는 사람의 모든 기기 토큰에 보낸다');
select is(current_setting('test.claimed')::jsonb->0->>'post_type', 'vote', '누르면 열 글 종류를 함께 준다');
select ok(pg_temp.sent('t:stale') and pg_temp.sent('t:off') and pg_temp.sent('t:no-token') and pg_temp.sent('t:suspended'),
  '24시간 지난 알림, Push를 끈 사람, 토큰이 없는 사람, 정지된 사람은 보내지 않고 끝낸다');
select ok(not pg_temp.sent('t:comment'), '가져가기만 하고 보내지 않은 알림은 아직 끝나지 않았다');
select is((select count(*) from private.notifications where event_key in ('t:stale','t:off')), 2::bigint, '보내지 않은 알림도 목록에는 남는다');

set local role service_role;
select is(public.claim_push_notifications(), '[]'::jsonb, '다른 실행이 가져간 알림은 5분 동안 다시 가져가지 않는다');
reset role;
update private.notifications set push_claimed_at = now() - interval '6 minutes' where event_key = 't:like';
select set_config('test.sent_ids', (select array_agg(id)::text from private.notifications where event_key in ('t:vote','t:comment')), true);
set local role service_role;
select is((select jsonb_agg(c->>'body') from jsonb_array_elements(public.claim_push_notifications()) c),
  '["좋아요 받을 글"]'::jsonb, '응답 없이 5분이 지나면 다시 가져가 보낸다');

select lives_ok($$ select public.complete_push_notifications(current_setting('test.sent_ids')::bigint[],
  '{ExponentPushToken[a-android]}') $$, '보낸 알림을 끝내고 만료 토큰을 지운다');
reset role;
select ok(pg_temp.sent('t:vote') and pg_temp.sent('t:comment') and not pg_temp.sent('t:like'), '보낸 알림만 끝낸다');
select is((select array_agg(token order by token) from public.push_tokens where user_id = '13900000-0000-0000-0000-00000000000a'),
  '{ExponentPushToken[a-ios]}', 'DeviceNotRegistered 토큰만 지운다');

-- 알림을 받은 뒤 그 사람을 차단하면 목록처럼 Push도 보내지 않는다.
select pg_temp.notify('13900000-0000-0000-0000-00000000000a','post_commented','test.post','13900000-0000-0000-0000-00000000000b','t:blocked');
insert into private.user_blocks(blocker_id, blocked_id) values ('13900000-0000-0000-0000-00000000000a','13900000-0000-0000-0000-00000000000b');
update private.notifications set push_claimed_at = now() - interval '6 minutes' where event_key = 't:like';
set local role service_role;
select is(public.claim_push_notifications(), '[]'::jsonb, '차단한 사람의 행동은 Push로 보내지 않는다');
reset role;
select ok(pg_temp.sent('t:blocked') and pg_temp.sent('t:like'), '차단한 사람의 알림은 보내지 않고 끝낸다');

select is(private.invoke_push_send(), null, 'Vault에 주소·키가 없으면(로컬·설정 전) 발송 함수를 부르지 않는다');
select is((select command from cron.job where jobname = 'notifications-push-send'), 'select private.invoke_push_send()', '1분마다 발송 함수를 부른다');

select * from finish();
rollback;
