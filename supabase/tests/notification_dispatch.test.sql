begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- pg_net는 트랜잭션 커밋 뒤 전송하므로 이 테스트는 rollback하여 외부 요청을 보내지 않는다.
select vault.create_secret('https://example.invalid/functions/v1/notification-push','push_dispatch_url');
select vault.create_secret('dispatch-test-only','push_dispatch_secret');
select is(private.invoke_notification_push(),null::bigint,'빈 큐는 Vault 설정이 있어도 호출하지 않는다');
insert into auth.users(id,email) values ('13110000-0000-0000-0000-000000000001','dispatch@test.dev');
insert into private.posts(author_id,type,content)
values ('13110000-0000-0000-0000-000000000001','post','호출 조건 테스트') returning id as post_id \gset
insert into public.push_tokens(user_id,token,platform)
values ('13110000-0000-0000-0000-000000000001','ExponentPushToken[dispatch]','ios');
insert into private.notifications(recipient_id,type,post_id,title,body,event_key)
values ('13110000-0000-0000-0000-000000000001','post_liked',:post_id,'제목','본문','dispatch:test')
returning id as notification_id \gset
select ok(private.invoke_notification_push() is not null,'발송할 pending 작업이 있으면 호출한다');
update private.notification_push_deliveries set available_at=now()+interval '1 minute'
where notification_id=:notification_id;
select is(private.invoke_notification_push(),null::bigint,'재시도 시각 전에는 호출하지 않는다');
update private.notification_push_deliveries set available_at=now(), leased_until=now()+interval '5 minutes'
where notification_id=:notification_id;
select is(private.invoke_notification_push(),null::bigint,'다른 worker의 lease가 유효하면 호출하지 않는다');
update private.notification_push_deliveries set leased_until=now()-interval '1 second'
where notification_id=:notification_id;
select ok(private.invoke_notification_push() is not null,'lease가 만료된 재시도 작업은 호출한다');
update private.notification_push_deliveries set state='receipt',ticket_id='dispatch-ticket',leased_until=null
where notification_id=:notification_id;
select ok(private.invoke_notification_push() is not null,'새 발송 없이 receipt 확인만 남아도 호출한다');
update private.notification_push_deliveries set available_at=now()+interval '15 minutes'
where notification_id=:notification_id;
select is(private.invoke_notification_push(),null::bigint,'receipt 확인 시각 전에는 호출하지 않는다');
update private.notification_push_deliveries set state='delivered',available_at=now()
where notification_id=:notification_id;
select is(private.invoke_notification_push(),null::bigint,'완료 작업만 있으면 호출하지 않는다');

select is((select count(*) from cron.job where jobname='cron-run-details-cleanup'),1::bigint,'크론 기록 정리는 한 번만 등록한다');
select is((select schedule from cron.job where jobname='cron-run-details-cleanup'),'10 18 * * *','기록 정리는 매일 실행한다');
select ok(has_table_privilege((select username from cron.job where jobname='cron-run-details-cleanup'),
 'cron.job_run_details','DELETE'),'정리 작업 실행자는 기록 삭제 권한이 있다');
insert into cron.job_run_details(runid,jobid,username,status,start_time,end_time) values
 (-1311,-131,current_user,'succeeded',now()-interval '8 days',now()-interval '8 days'),
 (-1312,-131,current_user,'succeeded',now()-interval '1 day',now()-interval '1 day'),
 (-1313,-131,current_user,'running',now()-interval '8 days',null);
select command from cron.job where jobname='cron-run-details-cleanup' \gexec
select is((select count(*) from cron.job_run_details where jobid=-131 and end_time < now()-interval '7 days'),0::bigint,'7일 지난 완료 기록은 삭제한다');
select is((select count(*) from cron.job_run_details where jobid=-131),2::bigint,'최근 기록과 실행 중인 작업은 보존한다');
select * from finish();
rollback;
