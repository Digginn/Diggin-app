-- 댓글 좋아요(LIKE-004, #237): 댓글·답글 모두, 본인 댓글 불가, 알림 없음, 보이는 댓글만.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values
 ('23710000-0000-0000-0000-000000000001','like-author@test.dev'),
 ('23710000-0000-0000-0000-000000000002','like-a@test.dev'),
 ('23710000-0000-0000-0000-000000000003','like-b@test.dev');
insert into private.posts(author_id,type,content) values ('23710000-0000-0000-0000-000000000001','post','댓글 좋아요 테스트 글');
select set_config('test.post',(select id::text from private.posts where content='댓글 좋아요 테스트 글'),true);

set local request.jwt.claims = '{"sub":"23710000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select set_config('test.comment',public.create_comment(current_setting('test.post')::bigint,'A 댓글',gen_random_uuid())->>'id',true);
reset role;
set local request.jwt.claims = '{"sub":"23710000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select set_config('test.reply',public.create_comment(current_setting('test.post')::bigint,'B 답글',gen_random_uuid(),current_setting('test.comment')::bigint)->>'id',true);
select is(public.set_comment_like(current_setting('test.comment')::bigint,true),'{"is_liked":true,"like_count":1}'::jsonb,'다른 사람 댓글에 좋아요');
select is(public.set_comment_like(current_setting('test.comment')::bigint,true)->>'like_count','1','같은 상태를 다시 보내도 한 번만');
select throws_ok(format($$select public.set_comment_like(%s,true)$$,current_setting('test.reply')),'42501','own_comment_like','본인 답글에는 좋아요를 누를 수 없음');
select is((public.get_community_comments(current_setting('test.post')::bigint)->0->>'like_count'),'1','목록에 좋아요 수');
select is((public.get_community_comments(current_setting('test.post')::bigint)->0->>'is_liked'),'true','목록에 내 좋아요 상태');
reset role;
set local request.jwt.claims = '{"sub":"23710000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(public.set_comment_like(current_setting('test.reply')::bigint,true)->>'like_count','1','답글에도 좋아요');
select is(public.set_comment_like(current_setting('test.comment')::bigint,true)->>'like_count','2','여러 사람이 누르면 수가 늘어난다');
select is((public.get_community_comments(current_setting('test.post')::bigint)->0->'replies'->0->>'like_count'),'1','답글 좋아요 수');
select is(public.set_comment_like(current_setting('test.comment')::bigint,false),'{"is_liked":false,"like_count":1}'::jsonb,'좋아요 취소');
select throws_ok($$select public.set_comment_like(999999999,true)$$,'42501','comment_not_found','없는 댓글');
select throws_ok($$select public.set_comment_like(1,null)$$,'22023','invalid_like_state','상태 없이 보내면 거부');
reset role;
select is((select count(*)::int from private.notifications where post_id=current_setting('test.post')::bigint and type='post_liked'),0,'댓글 좋아요는 알리지 않는다');

-- 원 댓글을 차단하면 그 아래 답글도 안 보여 좋아요를 누를 수 없다.
insert into private.user_blocks(blocker_id,blocked_id) values ('23710000-0000-0000-0000-000000000001','23710000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_ok(format($$select public.set_comment_like(%s,true)$$,current_setting('test.comment')),'42501','comment_not_found','차단한 사람 댓글에는 누를 수 없음');
select lives_ok(format($$select public.set_comment_like(%s,false)$$,current_setting('test.reply')),'안 보이게 된 답글의 좋아요는 취소할 수 있다');
reset role;
delete from private.user_blocks where blocker_id='23710000-0000-0000-0000-000000000001';

-- 지운 댓글
update private.comments set deleted_at=now() where id=current_setting('test.reply')::bigint;
set local role authenticated;
select throws_ok(format($$select public.set_comment_like(%s,true)$$,current_setting('test.reply')),'42501','comment_not_found','지운 답글에는 누를 수 없음');
reset role;

-- 기간 제한 중에는 누르거나 취소할 수 없다.
update public.profiles set status='community_restricted',restricted_until=now()+interval '7 days' where id='23710000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"23710000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select throws_ok(format($$select public.set_comment_like(%s,false)$$,current_setting('test.comment')),'42501','community_restricted','제한 중 좋아요 차단');
reset role;

-- 댓글을 닫은 공지
update private.posts set notice_title='좋아요 공지',notice_comments_closed=true where id=current_setting('test.post')::bigint;
set local request.jwt.claims = '{"sub":"23710000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(format($$select public.set_comment_like(%s,true)$$,current_setting('test.comment')),'P0001','notice_comments_closed','댓글 닫힌 공지');
reset role;

set local role anon;
select throws_ok(format($$select public.set_comment_like(%s,true)$$,current_setting('test.comment')),'42501',null,'비회원은 호출할 수 없음');
reset role;
select * from finish();
rollback;
