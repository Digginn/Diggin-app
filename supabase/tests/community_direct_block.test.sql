begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values
 ('18600000-0000-0000-0000-000000000001','direct-author@test.dev'),
 ('18600000-0000-0000-0000-000000000002','direct-viewer@test.dev'),
 ('18600000-0000-0000-0000-000000000003','direct-host@test.dev');
insert into private.posts(author_id,type,content) values
 ('18600000-0000-0000-0000-000000000001','post','독립 차단 대상 일반글'),
 ('18600000-0000-0000-0000-000000000002','post','차단 사용자 본인 글'),
 ('18600000-0000-0000-0000-000000000003','post','다른 작성자의 부모 글');
select set_config('test.post',(select id::text from private.posts where content='독립 차단 대상 일반글'),true);
select set_config('test.own',(select id::text from private.posts where content='차단 사용자 본인 글'),true);
select set_config('test.host',(select id::text from private.posts where content='다른 작성자의 부모 글'),true);
insert into private.posts(author_id,type,content,ends_at) values
 ('18600000-0000-0000-0000-000000000001','vote','독립 차단 대상 투표글',now()+interval '24 hours');
select set_config('test.vote',(select max(id)::text from private.posts),true);
insert into private.comments(post_id,author_id,content) values
 (current_setting('test.host')::bigint,'18600000-0000-0000-0000-000000000001','독립 차단 댓글');
select set_config('test.comment',(select max(id)::text from private.comments),true);
set local role anon;
select throws_ok($$select public.block_community_author('post',current_setting('test.post')::bigint)$$,'42501',null,'비회원 독립 차단 거부');
set local role authenticated;
select throws_ok($$select public.block_community_author('post',current_setting('test.post')::bigint)$$,'42501','not_authenticated','JWT 없는 독립 차단 거부');
set local request.jwt.claims='{"sub":"18600000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select public.block_community_author('post',current_setting('test.own')::bigint)$$,'42501','own_block','신고가 없어도 자기 자신 차단 거부');
select throws_ok($$select public.block_community_author('user',1)$$,'22023','invalid_report_target','사용자 ID 직접 전달 거부');
select throws_ok($$select public.block_community_author('post',9223372036854775807)$$,'42501','report_target_not_found','없는 글 거부');
reset role;
update private.posts set hidden_at=now() where id=current_setting('test.post')::bigint;
set local role authenticated;
select throws_ok($$select public.block_community_author('post',current_setting('test.post')::bigint)$$,'42501','report_target_not_found','관리자 숨김 글 거부');
reset role;
update private.posts set hidden_at=null,deleted_at=now() where id=current_setting('test.post')::bigint;
set local role authenticated;
select throws_ok($$select public.block_community_author('post',current_setting('test.post')::bigint)$$,'42501','report_target_not_found','삭제 글 거부');
reset role;
update private.posts set deleted_at=null where id=current_setting('test.post')::bigint;
update private.comments set author_id=null where id=current_setting('test.comment')::bigint;
set local role authenticated;
select throws_ok($$select public.block_community_author('comment',current_setting('test.comment')::bigint)$$,'42501','report_target_not_found','탈퇴 댓글 작성자 차단 거부');
reset role;
update private.comments set author_id='18600000-0000-0000-0000-000000000001' where id=current_setting('test.comment')::bigint;
update private.posts set hidden_at=now() where id=current_setting('test.host')::bigint;
set local role authenticated;
select throws_ok($$select public.block_community_author('comment',current_setting('test.comment')::bigint)$$,'42501','report_target_not_found','부모 숨김 댓글 차단 거부');
reset role;
update private.posts set hidden_at=null where id=current_setting('test.host')::bigint;
set local role authenticated;
select public.block_community_author('post',current_setting('test.host')::bigint);
select throws_ok($$select public.block_community_author('comment',current_setting('test.comment')::bigint)$$,'42501','report_target_not_found','차단한 부모 글을 통해 다른 댓글 작성자를 새로 차단할 수 없다');
reset role;
delete from private.user_blocks where blocker_id='18600000-0000-0000-0000-000000000002';
set local role authenticated;
select public.report_community_content('post',current_setting('test.host')::bigint,'spam');
select throws_ok($$select public.block_community_author('comment',current_setting('test.comment')::bigint)$$,'42501','report_target_not_found','신고해 숨겨진 부모 글의 댓글 작성자 직접 차단 거부');
reset role;
delete from private.reports where reporter_id='18600000-0000-0000-0000-000000000002';
set local role authenticated;
select lives_ok($$select public.block_community_author('comment',current_setting('test.comment')::bigint)$$,'신고 없이 댓글 작성자 차단');
select lives_ok($$select public.block_community_author('comment',current_setting('test.comment')::bigint)$$,'직접 댓글 차단 재시도 안전');
select lives_ok($$select public.block_community_author('post',current_setting('test.post')::bigint)$$,'신고 없이 일반글 작성자 차단');
select lives_ok($$select public.block_community_author('post',current_setting('test.vote')::bigint)$$,'신고 없이 투표글 작성자 차단');
select is(public.get_community_post(current_setting('test.post')::bigint),null,'차단한 일반글 숨김');
select is(public.get_community_post(current_setting('test.vote')::bigint),null,'같은 작성자의 투표글 숨김');
select is(jsonb_array_length(public.get_community_comments(current_setting('test.host')::bigint)),0,'같은 작성자의 댓글 숨김');
reset role;
select is((select count(*) from private.reports where reporter_id='18600000-0000-0000-0000-000000000002'),0::bigint,'차단만으로 신고 생성 안 함');
select is((select count(*) from private.user_blocks where blocker_id='18600000-0000-0000-0000-000000000002'),1::bigint,'중복 차단 없음');
set local request.jwt.claims='{"sub":"18600000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select isnt(public.get_community_post(current_setting('test.own')::bigint),null,'차단당한 쪽에서는 상대 글 유지');
reset role;
select * from finish();
rollback;
