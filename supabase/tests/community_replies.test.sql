-- 답글(CMT-09, #237): 1단계까지만, 원 댓글 아래 오래된 순, 원 댓글이 안 보이면 답글도 빠진다.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values
 ('23700000-0000-0000-0000-000000000001','reply-author@test.dev'),
 ('23700000-0000-0000-0000-000000000002','reply-a@test.dev'),
 ('23700000-0000-0000-0000-000000000003','reply-b@test.dev'),
 ('23700000-0000-0000-0000-000000000009','reply-admin@test.dev');
insert into auth.sessions(id,user_id) values ('23700000-0000-0000-0009-000000000009','23700000-0000-0000-0000-000000000009');
insert into private.admin_users(id,email,role) values ('23700000-0000-0000-0000-000000000009','reply-admin@test.dev','operator');
insert into private.posts(author_id,type,content) values
 ('23700000-0000-0000-0000-000000000001','post','답글 테스트 글'),
 ('23700000-0000-0000-0000-000000000001','post','답글 테스트 다른 글');
select set_config('test.post',(select id::text from private.posts where content='답글 테스트 글'),true);
select set_config('test.other',(select id::text from private.posts where content='답글 테스트 다른 글'),true);
insert into public.push_tokens(user_id,token,platform)
values ('23700000-0000-0000-0000-000000000002','ExponentPushToken[reply-a-test]','ios');

-- A가 원 댓글, 글쓴이와 B가 답글
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select set_config('test.parent',public.create_comment(current_setting('test.post')::bigint,'원 댓글',gen_random_uuid())->>'id',true);
select set_config('test.second',public.create_comment(current_setting('test.post')::bigint,'두 번째 원 댓글',gen_random_uuid())->>'id',true);
reset role;
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(public.create_comment(current_setting('test.post')::bigint,'글쓴이 답글',gen_random_uuid(),current_setting('test.parent')::bigint)->>'parent_id',
  current_setting('test.parent'),'답글은 원 댓글 ID를 가진다');
reset role;
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select set_config('test.reply',public.create_comment(current_setting('test.post')::bigint,'B 답글','23700000-0000-0000-0001-000000000001',current_setting('test.parent')::bigint)->>'id',true);
select is(public.create_comment(current_setting('test.post')::bigint,'B 답글','23700000-0000-0000-0001-000000000001',current_setting('test.parent')::bigint)->>'id',
  current_setting('test.reply'),'같은 요청 재시도는 같은 답글');
select throws_ok(format($$select public.create_comment(%s,'B 답글','23700000-0000-0000-0001-000000000001',%s)$$,current_setting('test.post'),current_setting('test.second')),
  '22023','invalid_request_id','같은 키로 다른 원 댓글에 답글을 달지 못함');
select throws_ok(format($$select public.create_comment(%s,'B 답글','23700000-0000-0000-0001-000000000001')$$,current_setting('test.post')),
  '22023','invalid_request_id','같은 키로 원 댓글을 만들지 못함');
select throws_ok(format($$select public.create_comment(%s,'답글의 답글',gen_random_uuid(),%s)$$,current_setting('test.post'),current_setting('test.reply')),
  '22023','invalid_reply_target','답글에는 답글을 달 수 없음');
select throws_ok(format($$select public.create_comment(%s,'다른 글 답글',gen_random_uuid(),%s)$$,current_setting('test.other'),current_setting('test.parent')),
  '42501','comment_not_found','다른 글의 댓글에는 답글을 달 수 없음');
select throws_ok(format($$select public.create_comment(%s,'없는 댓글 답글',gen_random_uuid(),999999999)$$,current_setting('test.post')),
  '42501','comment_not_found','없는 댓글에는 답글을 달 수 없음');
select throws_ok(format($$select public.create_comment(%s,repeat('가',151),gen_random_uuid(),%s)$$,current_setting('test.post'),current_setting('test.parent')),
  '22023','invalid_comment_content','답글도 151자 거부');
select is(public.get_community_comments(current_setting('test.post')::bigint)->0->'replies'->1->>'anon_number','2','답글 작성자도 디기 번호를 받는다');

select is(jsonb_array_length(public.get_community_comments(current_setting('test.post')::bigint)),2,'목록은 원 댓글만 센다');
select is(public.get_community_comments(current_setting('test.post')::bigint)->0->>'parent_id',null,'원 댓글은 parent_id가 없다');
select is((select array_agg(r->>'content') from jsonb_array_elements(public.get_community_comments(current_setting('test.post')::bigint)->0->'replies') r),
  array['글쓴이 답글','B 답글'],'답글은 원 댓글 안에 오래된 순');
select is(public.get_community_comments(current_setting('test.post')::bigint)->0->'replies'->0->>'is_post_author','true','답글도 글쓴이 표시');
select is(public.get_community_comments(current_setting('test.post')::bigint)->1->'replies','[]'::jsonb,'답글 없는 댓글은 빈 목록');
select is(public.get_community_post(current_setting('test.post')::bigint)->>'comment_count','4','댓글 수에 답글 포함');
select is(public.update_comment(current_setting('test.reply')::bigint,'수정한 답글')->>'parent_id',current_setting('test.parent'),'답글 수정');
reset role;
select is((select count(*)::int from private.notifications where post_id=current_setting('test.post')::bigint and type='post_commented'
  and event_key='comment:' || current_setting('test.reply')),1,'답글도 게시글 작성자 댓글 알림');

-- 원 댓글 작성자 A에게 답글 알림. 글쓴이가 단 답글도 알리고, 자기 댓글에 단 답글은 알리지 않는다.
select is((select array_agg(body order by id) from private.notifications
  where recipient_id='23700000-0000-0000-0000-000000000002' and event_key like 'reply:%'),
  array[(select nickname from public.profiles where id='23700000-0000-0000-0000-000000000001') || ': 글쓴이 답글',
        (select nickname from public.profiles where id='23700000-0000-0000-0000-000000000003') || ': B 답글'],
  '원 댓글 작성자는 다른 사람의 답글마다 알림을 받는다');
select is((select distinct title from private.notifications where event_key like 'reply:%'),
  '내 댓글에 답글이 달렸어요.','답글 알림 제목');
select is((select count(*)::int from private.notification_push_deliveries d join private.notifications n on n.id=d.notification_id
  where n.event_key='reply:' || current_setting('test.reply')),1,'답글 알림도 Push 대기열에 들어간다');
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select lives_ok(format($$select public.create_comment(%s,'내 댓글에 내 답글',gen_random_uuid(),%s)$$,current_setting('test.post'),current_setting('test.parent')),'자기 댓글에 답글');
reset role;
select is((select count(*)::int from private.notifications
  where recipient_id='23700000-0000-0000-0000-000000000002' and event_key like 'reply:%'),2,'자기 답글은 알리지 않는다');

-- 글쓴이 댓글에 단 답글은 게시글 댓글 알림 하나만 간다.
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select set_config('test.author_comment',public.create_comment(current_setting('test.post')::bigint,'글쓴이 댓글',gen_random_uuid())->>'id',true);
reset role;
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select set_config('test.author_reply',public.create_comment(current_setting('test.post')::bigint,'글쓴이에게 답글',gen_random_uuid(),current_setting('test.author_comment')::bigint)->>'id',true);
reset role;
select is((select array_agg(event_key) from private.notifications where recipient_id='23700000-0000-0000-0000-000000000001'
  and event_key in ('comment:' || current_setting('test.author_reply'),'reply:' || current_setting('test.author_reply'))),
  array['comment:' || current_setting('test.author_reply')],'글쓴이 댓글의 답글은 알림이 겹치지 않는다');

-- 원 댓글 작성자가 차단한 사람의 답글은 알리지 않는다.
insert into private.user_blocks(blocker_id,blocked_id) values ('23700000-0000-0000-0000-000000000002','23700000-0000-0000-0000-000000000003');
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select set_config('test.blocked_reply',public.create_comment(current_setting('test.post')::bigint,'차단된 사람 답글',gen_random_uuid(),current_setting('test.parent')::bigint)->>'id',true);
reset role;
select is((select count(*)::int from private.notifications where event_key='reply:' || current_setting('test.blocked_reply')),0,'차단한 사람의 답글은 알리지 않는다');
delete from private.user_blocks where blocker_id='23700000-0000-0000-0000-000000000002';

-- NOTI-010 답글 알림은 투표글에도 간다. 투표글 작성자는 댓글 알림(NOTI-004)이 없어 자기 댓글의 답글 알림을 받는다.
insert into private.posts(author_id,type,content,ends_at)
values ('23700000-0000-0000-0000-000000000001','vote','답글 테스트 투표',now()+interval '24 hours');
select set_config('test.vote',(select id::text from private.posts where content='답글 테스트 투표'),true);
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select set_config('test.vote_parent',public.create_comment(current_setting('test.vote')::bigint,'투표 원 댓글',gen_random_uuid())->>'id',true);
reset role;
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select set_config('test.vote_reply',public.create_comment(current_setting('test.vote')::bigint,'투표 글쓴이 답글',gen_random_uuid(),current_setting('test.vote_parent')::bigint)->>'id',true);
select set_config('test.vote_author_comment',public.create_comment(current_setting('test.vote')::bigint,'투표 글쓴이 댓글',gen_random_uuid())->>'id',true);
reset role;
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select set_config('test.vote_author_reply',public.create_comment(current_setting('test.vote')::bigint,'투표 글쓴이에게 답글',gen_random_uuid(),current_setting('test.vote_author_comment')::bigint)->>'id',true);
reset role;
select is((select array_agg(recipient_id::text || ' ' || event_key order by id) from private.notifications where post_id=current_setting('test.vote')::bigint),
  array['23700000-0000-0000-0000-000000000002 reply:' || current_setting('test.vote_reply'),
        '23700000-0000-0000-0000-000000000001 reply:' || current_setting('test.vote_author_reply')],
  '투표글 답글은 원 댓글 작성자에게만 알리고 댓글 알림은 만들지 않는다');

-- 관리자 신고 상세는 신고된 답글의 원 댓글을 함께 준다.
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select set_config('test.reply_report',public.report_community_content('comment',current_setting('test.reply')::bigint,'spam'),true);
reset role;
select is(public.admin_report_detail('23700000-0000-0000-0000-000000000009','23700000-0000-0000-0009-000000000009',current_setting('test.reply_report')::bigint)->'parent_comment'->>'content',
  '원 댓글','신고 상세에 원 댓글 노출');
select is(public.admin_report_detail('23700000-0000-0000-0000-000000000009','23700000-0000-0000-0009-000000000009',current_setting('test.reply_report')::bigint)->'comment'->>'parent_id',
  current_setting('test.parent'),'신고된 댓글이 답글인지 알 수 있다');
select set_config('test.author_reply_on_parent',(select id::text from private.comments where content='글쓴이 답글'),true);

-- B가 원 댓글 작성자 A를 차단하면 B에게는 그 아래 답글도 빠진다.
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select lives_ok(format($$select public.block_community_author('comment',%s)$$,current_setting('test.parent')),'원 댓글 작성자 차단');
select is(jsonb_array_length(public.get_community_comments(current_setting('test.post')::bigint)),1,'차단한 작성자의 원 댓글과 답글 제외(글쓴이 댓글만 남음)');
select is(public.get_community_post(current_setting('test.post')::bigint)->>'comment_count','2','차단으로 빠진 답글은 댓글 수에서도 제외');
select throws_ok(format($$select public.create_comment(%s,'차단 후 답글',gen_random_uuid(),%s)$$,current_setting('test.post'),current_setting('test.parent')),
  '42501','comment_not_found','안 보이는 댓글에는 답글을 달 수 없음');
reset role;

-- 원 댓글을 지우면 답글도 목록에서 빠진다.
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select lives_ok(format($$select public.delete_comment(%s)$$,current_setting('test.parent')),'원 댓글 삭제');
select is(jsonb_array_length(public.get_community_comments(current_setting('test.post')::bigint)),2,'삭제한 원 댓글과 그 답글 제외');
select is(public.get_community_post(current_setting('test.post')::bigint)->>'comment_count','3','삭제한 원 댓글의 답글은 댓글 수에서 제외');
select throws_ok(format($$select public.create_comment(%s,'삭제 후 답글',gen_random_uuid(),%s)$$,current_setting('test.post'),current_setting('test.parent')),
  '42501','comment_not_found','삭제한 댓글에는 답글을 달 수 없음');
select throws_ok(format($$select public.report_community_content('comment',%s,'spam')$$,current_setting('test.author_reply_on_parent')),
  '42501','report_target_not_found','원 댓글이 지워져 안 보이는 답글은 신고할 수 없음');
reset role;
select * from finish();
rollback;
