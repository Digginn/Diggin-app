-- 답글(CMT-09, #237): 1단계까지만, 원 댓글 아래 오래된 순, 원 댓글이 안 보이면 답글도 빠진다.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values
 ('23700000-0000-0000-0000-000000000001','reply-author@test.dev'),
 ('23700000-0000-0000-0000-000000000002','reply-a@test.dev'),
 ('23700000-0000-0000-0000-000000000003','reply-b@test.dev');
insert into private.posts(author_id,type,content) values
 ('23700000-0000-0000-0000-000000000001','post','답글 테스트 글'),
 ('23700000-0000-0000-0000-000000000001','post','답글 테스트 다른 글');
select set_config('test.post',(select id::text from private.posts where content='답글 테스트 글'),true);
select set_config('test.other',(select id::text from private.posts where content='답글 테스트 다른 글'),true);

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

-- B가 원 댓글 작성자 A를 차단하면 B에게는 그 아래 답글도 빠진다.
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select lives_ok(format($$select public.block_community_author('comment',%s)$$,current_setting('test.parent')),'원 댓글 작성자 차단');
select is(jsonb_array_length(public.get_community_comments(current_setting('test.post')::bigint)),0,'차단한 작성자의 원 댓글과 답글 제외');
select is(public.get_community_post(current_setting('test.post')::bigint)->>'comment_count','0','차단으로 빠진 답글은 댓글 수에서도 제외');
select throws_ok(format($$select public.create_comment(%s,'차단 후 답글',gen_random_uuid(),%s)$$,current_setting('test.post'),current_setting('test.parent')),
  '42501','comment_not_found','안 보이는 댓글에는 답글을 달 수 없음');
reset role;

-- 원 댓글을 지우면 답글도 목록에서 빠진다.
set local request.jwt.claims = '{"sub":"23700000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select lives_ok(format($$select public.delete_comment(%s)$$,current_setting('test.parent')),'원 댓글 삭제');
select is(jsonb_array_length(public.get_community_comments(current_setting('test.post')::bigint)),1,'삭제한 원 댓글과 그 답글 제외');
select is(public.get_community_post(current_setting('test.post')::bigint)->>'comment_count','1','삭제한 원 댓글의 답글은 댓글 수에서 제외');
select throws_ok(format($$select public.create_comment(%s,'삭제 후 답글',gen_random_uuid(),%s)$$,current_setting('test.post'),current_setting('test.parent')),
  '42501','comment_not_found','삭제한 댓글에는 답글을 달 수 없음');
reset role;
select * from finish();
rollback;
