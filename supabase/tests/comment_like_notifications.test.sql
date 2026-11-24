-- 댓글 좋아요 10개 알림(NOTI-011)과 답글 Push 42자(NOTI-010), 알림의 댓글 위치(#237).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id, email) values
 ('23720000-0000-0000-0000-00000000000a', 'cl-author@test.dev'),
 ('23720000-0000-0000-0000-00000000000b', 'cl-other@test.dev');
insert into auth.users(id, email)
 select ('23720000-0000-0000-0001-0000000000' || lpad(n::text, 2, '0'))::uuid, 'cl-liker' || n || '@test.dev'
 from generate_series(1, 10) n;
insert into private.posts(author_id, type, content) values ('23720000-0000-0000-0000-00000000000b', 'post', '댓글 좋아요 알림 글');
select set_config('test.post', (select max(id)::text from private.posts), true);
insert into private.comments(post_id, author_id, content)
 values (current_setting('test.post')::bigint, '23720000-0000-0000-0000-00000000000a', E'둘 다 너무 예뻐서\n고민 중이에요 어떤 게 나을까요');
select set_config('test.comment', (select max(id)::text from private.comments), true);
insert into public.push_tokens(user_id, token, platform)
 values ('23720000-0000-0000-0000-00000000000a', 'ExponentPushToken[comment-like]', 'ios');

create function pg_temp.liked() returns setof private.notifications language sql as $$
  select * from private.notifications where type = 'comment_liked' and comment_id = current_setting('test.comment')::bigint;
$$;
create function pg_temp.add_like(n integer) returns void language sql as $$
  insert into private.comment_likes(comment_id, user_id)
  values (current_setting('test.comment')::bigint, ('23720000-0000-0000-0001-0000000000' || lpad(n::text, 2, '0'))::uuid);
$$;

select pg_temp.add_like(n) from generate_series(1, 9) n;
select is((select count(*) from pg_temp.liked()), 0::bigint, '9개까지는 알리지 않는다');
select pg_temp.add_like(10);
select is((select count(*) from pg_temp.liked()), 1::bigint, '10개가 되면 댓글 작성자에게 한 번 알린다');
select is((select recipient_id::text || ' / ' || post_id::text || ' / ' || title || ' / ' || body || ' / ' || coalesce(actor_id::text, 'null') from pg_temp.liked()),
  '23720000-0000-0000-0000-00000000000a / ' || current_setting('test.post') ||
  ' / 내 댓글에 10개 이상의 좋아요가 달렸어요. / ''둘 다 너무 예뻐서 고민 중이에요 어...'' 댓글에 달린 좋아요를 확인해 보세요. / null',
  '댓글 앞 20자와 안내 문장, 댓글 위치를 담는다');

-- 답글에도 같은 기준으로 보낸다.
insert into private.comments(post_id, parent_id, author_id, content)
 values (current_setting('test.post')::bigint, current_setting('test.comment')::bigint, '23720000-0000-0000-0000-00000000000b', '짧은 답글');
select set_config('test.reply', (select max(id)::text from private.comments), true);
insert into private.comment_likes(comment_id, user_id)
 select current_setting('test.reply')::bigint, ('23720000-0000-0000-0001-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 10) n;
select is((select body from private.notifications where type = 'comment_liked' and comment_id = current_setting('test.reply')::bigint),
  '''짧은 답글'' 댓글에 달린 좋아요를 확인해 보세요.', '답글 좋아요도 10개가 되면 답글 작성자에게 알린다');

-- 답글 Push는 닉네임 뒤 본문을 42자까지, 댓글 Push는 자르지 않는다.
insert into private.posts(author_id, type, content) values ('23720000-0000-0000-0000-00000000000a', 'post', '내 글 Push 확인');
insert into private.comments(post_id, author_id, content)
 values ((select max(id) from private.posts), '23720000-0000-0000-0000-00000000000b', repeat('나', 50));
insert into private.comments(post_id, parent_id, author_id, content)
 values (current_setting('test.post')::bigint, current_setting('test.comment')::bigint, '23720000-0000-0000-0000-00000000000b', repeat('가', 50));
select set_config('test.nickname', (select nickname from public.profiles where id = '23720000-0000-0000-0000-00000000000b'), true);
set local role service_role;
select set_config('test.jobs', public.claim_notification_pushes(false)::text, true);
reset role;
select is((select j->>'body' from jsonb_array_elements(current_setting('test.jobs')::jsonb) j where j->>'body' like '%가가%'),
  current_setting('test.nickname') || ': ' || repeat('가', 42) || '...', '답글 Push는 본문을 42자로 줄인다');
select is((select j->>'body' from jsonb_array_elements(current_setting('test.jobs')::jsonb) j where j->>'body' like '%나나%'),
  current_setting('test.nickname') || ': ' || repeat('나', 50), '댓글 Push는 자르지 않는다');
select is((select j->>'comment_id' from jsonb_array_elements(current_setting('test.jobs')::jsonb) j where j->>'title' = '내 댓글에 10개 이상의 좋아요가 달렸어요.' limit 1),
  current_setting('test.comment'), '댓글 좋아요 Push에 댓글 위치를 담는다');

set local request.jwt.claims = '{"sub":"23720000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;
select is((select x->>'comment_id' from jsonb_array_elements(public.get_app_notifications()) x where x->>'title' = '내 댓글에 10개 이상의 좋아요가 달렸어요.'),
  current_setting('test.comment'), '알림함도 댓글 위치를 내려준다');
select ok((select bool_and(x->>'comment_id' is null) from jsonb_array_elements(public.get_app_notifications()) x where x->>'title' <> '내 댓글에 10개 이상의 좋아요가 달렸어요.'),
  '다른 알림은 댓글 위치가 없다');
reset role;

-- 취소 후 다시 10개가 되거나 알림이 지워진 뒤에도 댓글당 한 번만 보낸다.
delete from private.comment_likes where comment_id = current_setting('test.comment')::bigint and user_id = '23720000-0000-0000-0001-000000000010';
select pg_temp.add_like(10);
select is((select count(*) from pg_temp.liked()), 1::bigint, '취소 후 다시 10개가 돼도 한 번만 알린다');
delete from private.notifications where type = 'comment_liked' and comment_id = current_setting('test.comment')::bigint;
delete from private.comment_likes where comment_id = current_setting('test.comment')::bigint and user_id = '23720000-0000-0000-0001-000000000010';
select pg_temp.add_like(10);
select is((select count(*) from pg_temp.liked()), 0::bigint, '알림이 지워진 뒤 다시 10개가 돼도 보내지 않는다');

-- 지운 댓글에는 알리지 않는다.
insert into private.comments(post_id, author_id, content)
 values (current_setting('test.post')::bigint, '23720000-0000-0000-0000-00000000000a', '지울 댓글');
select set_config('test.comment', (select max(id)::text from private.comments), true);
select pg_temp.add_like(n) from generate_series(1, 9) n;
update private.comments set deleted_at = now() where id = current_setting('test.comment')::bigint;
select pg_temp.add_like(10);
select is((select count(*) from pg_temp.liked()), 0::bigint, '지운 댓글은 알리지 않는다');

select ok(not has_table_privilege('authenticated', 'private.comment_like_notifications', 'SELECT')
  and not has_table_privilege('anon', 'private.comment_like_notifications', 'INSERT'), '앱은 댓글 좋아요 알림 발송 이력에 접근하지 못한다');
select * from finish();
rollback;
