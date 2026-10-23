begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values
 ('13100000-0000-0000-0000-00000000000a','push-a@test.dev'),
 ('13100000-0000-0000-0000-00000000000b','push-b@test.dev');
insert into private.posts(author_id,type,content)
values ('13100000-0000-0000-0000-00000000000a','post','알림 발송 테스트 일반글');
select set_config('test.push_post',(select max(id)::text from private.posts),true);
insert into public.push_tokens(user_id,token,platform) values
 ('13100000-0000-0000-0000-00000000000a','ExponentPushToken[android-a]','android'),
 ('13100000-0000-0000-0000-00000000000a','ExponentPushToken[ios-a]','ios'),
 ('13100000-0000-0000-0000-00000000000b','ExponentPushToken[other]','android');
insert into private.notifications(recipient_id,type,post_id,actor_id,title,body,event_key)
values ('13100000-0000-0000-0000-00000000000a','post_liked',current_setting('test.push_post')::bigint,
 '13100000-0000-0000-0000-00000000000b','좋아요','목록 본문','push:test');
select is((select count(*) from private.notification_push_deliveries),2::bigint,'수신자의 모든 기기만 enqueue');
select ok(not has_table_privilege('authenticated','private.notification_push_deliveries','SELECT'),'앱은 큐를 직접 읽지 못한다');
select ok(not has_function_privilege('anon','public.claim_notification_pushes(boolean)','EXECUTE'),'anon은 claim 불가');
select ok(not has_function_privilege('authenticated','public.claim_notification_pushes(boolean)','EXECUTE'),'사용자도 claim 불가');
select ok(not has_function_privilege('authenticated','public.finish_notification_push(bigint,uuid,text,text,text)','EXECUTE'),'사용자는 결과 위조 불가');
select ok(has_function_privilege('service_role','public.claim_notification_pushes(boolean)','EXECUTE'),'발송 서버만 claim 허용');
set local role service_role;
select set_config('test.jobs',public.claim_notification_pushes(false)::text,true);
select is(jsonb_array_length(current_setting('test.jobs')::jsonb),2,'두 기기를 선점');
select is(jsonb_array_length(public.claim_notification_pushes(false)),0,'다른 실행은 lease 중 작업을 받지 못한다');
select is(current_setting('test.jobs')::jsonb->0->>'body','알림 발송 테스트 일반글','좋아요 Push는 게시글 원문');
select ok(not public.finish_notification_push((current_setting('test.jobs')::jsonb->0->>'id')::bigint,
 gen_random_uuid(),'delivered'),'다른 lease로 결과 갱신 불가');
select ok(public.finish_notification_push((current_setting('test.jobs')::jsonb->0->>'id')::bigint,
 (current_setting('test.jobs')::jsonb->0->>'lease_id')::uuid,'accepted','ticket-a'),'첫 기기 ticket 저장');
select ok(public.finish_notification_push((current_setting('test.jobs')::jsonb->1->>'id')::bigint,
 (current_setting('test.jobs')::jsonb->1->>'lease_id')::uuid,'retry',null,'MessageRateExceeded'),'두 번째 기기만 재시도');
reset role;
select is((select push_sent_at from private.notifications where event_key='push:test'),null::timestamptz,'일부 실패는 전체 발송 완료 아님');
update private.notification_push_deliveries set available_at=now()-interval '1 second';
set local role service_role;
select set_config('test.retry',public.claim_notification_pushes(false)::text,true);
select is(jsonb_array_length(current_setting('test.retry')::jsonb),1,'성공한 기기는 재발송하지 않는다');
reset role;
-- 계정을 바꾼 기기와 알림 끔은 발송 시 재검사한다.
update public.push_tokens set user_id='13100000-0000-0000-0000-00000000000b'
where id=(select token_id from private.notification_push_deliveries where state='pending');
select ok(not private.push_notification_allowed((select id from private.notifications where event_key='push:test'),
 (select token_id from private.notification_push_deliveries where state='pending')),'계정 전환 후 과거 수신자 발송 불가');
insert into private.user_blocks(blocker_id,blocked_id)
values ('13100000-0000-0000-0000-00000000000a','13100000-0000-0000-0000-00000000000b');
select ok(not private.push_notification_allowed((select id from private.notifications where event_key='push:test'),
 (select token_id from private.notification_push_deliveries where state='receipt')),'대기 중 차단해도 발송하지 않는다');
delete from private.user_blocks where blocker_id='13100000-0000-0000-0000-00000000000a';
insert into private.notification_settings(user_id,push_enabled) values ('13100000-0000-0000-0000-00000000000a',false);
insert into private.notifications(recipient_id,type,post_id,title,body,event_key)
values ('13100000-0000-0000-0000-00000000000a','post_liked',current_setting('test.push_post')::bigint,'제목','본문','push:off');
select is((select count(*) from private.notification_push_deliveries),2::bigint,'Push 끔이면 목록만 생성');
-- 과거 receipt가 새로 등록한 토큰을 삭제하지 않는다.
select set_config('test.receipt_token',(select token_id::text from private.notification_push_deliveries where state='receipt'),true);
-- 같은 테스트 트랜잭션의 now()는 고정돼 있어 큐에 저장된 이전 등록 시각을 과거로 옮긴다.
update private.notification_push_deliveries set token_updated_at=now()-interval '1 second' where state='receipt';
set local role service_role;
select set_config('test.receipts',public.claim_notification_pushes(true)::text,true);
select ok(public.finish_notification_push((current_setting('test.receipts')::jsonb->0->>'id')::bigint,
 (current_setting('test.receipts')::jsonb->0->>'lease_id')::uuid,'unregistered'),'receipt 폐기 토큰 처리');
reset role;
select is((select count(*) from public.push_tokens where id=current_setting('test.receipt_token')::bigint),1::bigint,'재등록 토큰은 과거 receipt로 삭제하지 않는다');
-- lease 만료는 회수하고 오래된 worker의 결과는 거절한다.
update private.notification_push_deliveries set leased_until=now()-interval '1 second'
where state='pending';
set local role service_role;
select set_config('test.reclaimed',public.claim_notification_pushes(false)::text,true);
select is(jsonb_array_length(current_setting('test.reclaimed')::jsonb),1,'만료 lease는 다시 선점한다');
select ok(not public.finish_notification_push((current_setting('test.retry')::jsonb->0->>'id')::bigint,
 (current_setting('test.retry')::jsonb->0->>'lease_id')::uuid,'delivered'),'과거 worker가 새 lease를 완료할 수 없다');
select ok(public.finish_notification_push((current_setting('test.reclaimed')::jsonb->0->>'id')::bigint,
 (current_setting('test.reclaimed')::jsonb->0->>'lease_id')::uuid,'skipped'),'새 worker는 제외 완료한다');
reset role;
-- 재등록되지 않은 폐기 토큰은 DB에서도 제거한다.
update private.notification_settings set push_enabled=true where user_id='13100000-0000-0000-0000-00000000000a';
insert into private.notifications(recipient_id,type,post_id,title,body,event_key)
values ('13100000-0000-0000-0000-00000000000a','post_liked',current_setting('test.push_post')::bigint,'제목','본문','push:remove');
set local role service_role;
select set_config('test.remove',public.claim_notification_pushes(false)::text,true);
select ok(public.finish_notification_push((current_setting('test.remove')::jsonb->0->>'id')::bigint,
 (current_setting('test.remove')::jsonb->0->>'lease_id')::uuid,'unregistered'),'현재 등록 버전의 폐기 결과를 적용');
reset role;
select is((select count(*) from public.push_tokens where user_id='13100000-0000-0000-0000-00000000000a'),0::bigint,'유효하지 않은 기기 토큰을 지운다');
select ok(private.invoke_notification_push() is null,'Vault 미설정이면 외부 호출 없이 종료');
-- 댓글 알림은 원문 삭제 전에는 허용하고, 삭제 후에는 큐에 있어도 발송하지 않는다.
insert into public.push_tokens(user_id,token,platform)
values ('13100000-0000-0000-0000-00000000000a','ExponentPushToken[comment-a]','android');
insert into private.comments(post_id,author_id,content)
values (current_setting('test.push_post')::bigint,'13100000-0000-0000-0000-00000000000b','발송 대기 중 삭제할 댓글')
returning id as comment_id \gset
select ok(private.push_notification_allowed(
 (select id from private.notifications where event_key='comment:' || :comment_id),
 (select id from public.push_tokens where token='ExponentPushToken[comment-a]')),'살아 있는 댓글은 발송 허용');
update private.comments set deleted_at=now() where id=:comment_id;
select ok(not private.push_notification_allowed(
 (select id from private.notifications where event_key='comment:' || :comment_id),
 (select id from public.push_tokens where token='ExponentPushToken[comment-a]')),'삭제된 댓글은 발송 직전 제외');
set local role service_role;
select set_config('test.deleted_comment_jobs',public.claim_notification_pushes(false)::text,true);
select is((current_setting('test.deleted_comment_jobs')::jsonb->0->>'allowed')::boolean,false,'이미 큐에 있던 댓글도 claim 시 발송 불가');
reset role;
-- 삭제된 원문의 알림을 뒤늦게 생성하더라도 새 큐에 넣지 않는다.
delete from private.notifications where event_key='comment:' || :comment_id;
insert into private.notifications(recipient_id,type,post_id,actor_id,title,body,event_key)
values ('13100000-0000-0000-0000-00000000000a','post_commented',current_setting('test.push_post')::bigint,
 '13100000-0000-0000-0000-00000000000b','댓글','삭제된 댓글','comment:' || :comment_id);
select is((select count(*) from private.notification_push_deliveries d
 join private.notifications n on n.id=d.notification_id where n.event_key='comment:' || :comment_id),
 0::bigint,'삭제된 댓글은 enqueue에서도 제외');
select * from finish();
rollback;
