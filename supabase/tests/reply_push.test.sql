-- 답글 Push 본문 42자(NOTI-010)와 댓글 Push 원문(NOTI-004), #237.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id, email) values
 ('23730000-0000-0000-0000-00000000000a', 'rp-author@test.dev'),
 ('23730000-0000-0000-0000-00000000000b', 'rp-other@test.dev');
insert into public.push_tokens(user_id, token, platform)
 values ('23730000-0000-0000-0000-00000000000a', 'ExponentPushToken[reply-push]', 'ios');
insert into private.posts(author_id, type, content) values ('23730000-0000-0000-0000-00000000000a', 'post', '답글 Push 확인 글');
insert into private.comments(post_id, author_id, content)
 values ((select max(id) from private.posts), '23730000-0000-0000-0000-00000000000a', '내 댓글');
insert into private.comments(post_id, parent_id, author_id, content)
 values ((select max(id) from private.posts), (select max(id) from private.comments), '23730000-0000-0000-0000-00000000000b', repeat('가', 50));
insert into private.comments(post_id, author_id, content)
 values ((select max(id) from private.posts), '23730000-0000-0000-0000-00000000000b', repeat('나', 50));
select set_config('test.nickname', (select nickname from public.profiles where id = '23730000-0000-0000-0000-00000000000b'), true);
set local role service_role;
select set_config('test.jobs', public.claim_notification_pushes(false)::text, true);
reset role;
select is((select j->>'body' from jsonb_array_elements(current_setting('test.jobs')::jsonb) j where j->>'body' like '%가가%'),
  current_setting('test.nickname') || ': ' || repeat('가', 42) || '...', '답글 Push는 본문을 42자로 줄인다');
select is((select j->>'body' from jsonb_array_elements(current_setting('test.jobs')::jsonb) j where j->>'body' like '%나나%'),
  current_setting('test.nickname') || ': ' || repeat('나', 50), '댓글 Push는 자르지 않는다');
select is((select body from private.notifications where event_key like 'reply:%'),
  current_setting('test.nickname') || ': ' || repeat('가', 50), '알림함 답글 본문은 자르지 않는다');
select * from finish();
rollback;
