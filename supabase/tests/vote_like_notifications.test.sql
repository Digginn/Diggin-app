begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('14800000-0000-0000-0000-000000000001','vote-like-author@test.dev'),
 ('14800000-0000-0000-0000-000000000002','vote-like-actor@test.dev'),
 ('14800000-0000-0000-0000-000000000003','vote-like-blocked@test.dev');
insert into private.posts(author_id,type,content,ends_at) values
 ('14800000-0000-0000-0000-000000000001','vote','좋아요 알림 투표글',now()+interval '24 hours');
select set_config('test.vote_like',(select max(id)::text from private.posts),true);
insert into public.push_tokens(user_id,token,platform) values
 ('14800000-0000-0000-0000-000000000001','ExponentPushToken[vote-like-android]','android'),
 ('14800000-0000-0000-0000-000000000001','ExponentPushToken[vote-like-ios]','ios');

set local role authenticated;
set local request.jwt.claims = '{"sub":"14800000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$select public.set_community_like(current_setting('test.vote_like')::bigint,true)$$,'투표글 본인 좋아요');
select is(jsonb_array_length(public.get_notifications()),0,'본인 투표글 좋아요는 알리지 않는다');
set local request.jwt.claims = '{"sub":"14800000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok($$select public.set_community_like(current_setting('test.vote_like')::bigint,true)$$,'타인 투표글 좋아요');
select lives_ok($$select public.set_community_like(current_setting('test.vote_like')::bigint,true)$$,'동일 요청 재시도');
select lives_ok($$select public.set_community_like(current_setting('test.vote_like')::bigint,false)$$,'투표글 좋아요 취소');
select lives_ok($$select public.set_community_like(current_setting('test.vote_like')::bigint,true)$$,'투표글 좋아요 재등록');
set local request.jwt.claims = '{"sub":"14800000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(jsonb_array_length(public.get_notifications()),1,'재시도와 재등록에도 알림 한 번');
select is(public.get_notifications()->0->>'post_type','vote','알림에서 투표 상세로 이동할 유형 반환');
select is(public.get_notifications()->0->>'post_id',current_setting('test.vote_like'),'알림의 투표글 ID');
select is(public.has_unread_notifications(),true,'투표글 좋아요도 새 알림 점에 반영');
reset role;
select is((select count(*) from private.notification_push_deliveries),2::bigint,'작성자의 Android와 iOS 기기에 한 번씩 enqueue');
set local role service_role;
select set_config('test.vote_like_jobs',public.claim_notification_pushes(false)::text,true);
select is(jsonb_array_length(current_setting('test.vote_like_jobs')::jsonb),2,'발송 서버가 두 기기 작업을 선점');
select is(current_setting('test.vote_like_jobs')::jsonb->0->>'post_type','vote','Push도 투표 상세 경로');
select is(current_setting('test.vote_like_jobs')::jsonb->0->>'post_id',current_setting('test.vote_like'),'Push 투표글 ID');
select is(current_setting('test.vote_like_jobs')::jsonb->0->>'body','좋아요 알림 투표글','Push 본문은 좋아요 받은 투표 원문');
reset role;

insert into private.user_blocks(blocker_id,blocked_id) values
 ('14800000-0000-0000-0000-000000000001','14800000-0000-0000-0000-000000000003');
set local role authenticated;
set local request.jwt.claims = '{"sub":"14800000-0000-0000-0000-000000000003","role":"authenticated"}';
select lives_ok($$select public.set_community_like(current_setting('test.vote_like')::bigint,true)$$,'작성자가 차단한 사용자의 좋아요');
set local request.jwt.claims = '{"sub":"14800000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(jsonb_array_length(public.get_notifications()),1,'작성자가 차단한 사용자는 알리지 않는다');
reset role;
select is((select count(*) from private.notification_push_deliveries),2::bigint,'차단 사용자에 대해 Push도 추가하지 않는다');

insert into private.posts(author_id,type,content,ends_at) values
 ('14800000-0000-0000-0000-000000000001','vote','Push 끈 투표글',now()+interval '24 hours');
select set_config('test.vote_like_off',(select max(id)::text from private.posts),true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"14800000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.set_push_enabled(false),false,'작성자가 Push 수신을 끈다');
set local request.jwt.claims = '{"sub":"14800000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok($$select public.set_community_like(current_setting('test.vote_like_off')::bigint,true)$$,'Push를 끈 투표 작성자에게 좋아요');
set local request.jwt.claims = '{"sub":"14800000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(jsonb_array_length(public.get_notifications()),2,'Push를 꺼도 알림함에는 남는다');
reset role;
select is((select count(*) from private.notification_push_deliveries),2::bigint,'Push를 끄면 기기 발송 큐는 늘지 않는다');

update private.posts set deleted_at=now() where id=current_setting('test.vote_like')::bigint;
select ok(not private.push_notification_allowed((select id from private.notifications where post_id=current_setting('test.vote_like')::bigint),
 (select id from public.push_tokens where token='ExponentPushToken[vote-like-android]')),'발송 전 투표가 삭제되면 Push 차단');

select * from finish();
rollback;
