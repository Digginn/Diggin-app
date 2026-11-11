begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('19500000-0000-0000-0000-000000000001','nickname-author@test.dev'),
 ('19500000-0000-0000-0000-000000000002','nickname-commenter@test.dev');
select set_config('test.author_nickname',(select nickname from public.profiles where id='19500000-0000-0000-0000-000000000001'),true);
select set_config('test.commenter_nickname',(select nickname from public.profiles where id='19500000-0000-0000-0000-000000000002'),true);
insert into private.posts(author_id,type,content) values ('19500000-0000-0000-0000-000000000001','post','닉네임 표시 테스트');
select set_config('test.post',(select id::text from private.posts where content='닉네임 표시 테스트'),true);
insert into private.posts(author_id,type,content,ends_at) values ('19500000-0000-0000-0000-000000000002','vote','닉네임 투표 테스트',now()+interval '24 hours');
select set_config('test.vote',(select id::text from private.posts where content='닉네임 투표 테스트'),true);

set local role anon;
select ok(not (public.get_community_feed()->0 ? 'author_nickname'),'비회원 미리보기에는 닉네임을 추가하지 않는다');
select throws_ok($$select public.get_community_post(current_setting('test.post')::bigint)$$,'42501',null,'비회원은 닉네임을 얻으려고 상세를 호출할 수 없다');

set local role authenticated;
set local request.jwt.claims='{"sub":"19500000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.get_community_post(current_setting('test.post')::bigint)->>'author_nickname',current_setting('test.author_nickname'),'게시글에 가입 시 생성된 닉네임을 반환한다');
select ok(not (public.get_community_post(current_setting('test.post')::bigint) ?| array['author_id','email','avatar_path','avatar_url']),'작성자 UUID·이메일·사진은 공개하지 않는다');
select is((select count(*) from public.profiles where id='19500000-0000-0000-0000-000000000001'),0::bigint,'닉네임을 읽어도 다른 사람의 프로필 직접 조회는 계속 차단한다');
select set_config('test.comment',public.create_comment(current_setting('test.post')::bigint,'첫 댓글',gen_random_uuid())::text,true);
select is(current_setting('test.comment')::jsonb->>'author_nickname',current_setting('test.commenter_nickname'),'댓글 등록 응답에도 계정 닉네임을 반환한다');
select is(current_setting('test.comment')::jsonb->>'anon_number','1','구버전 앱의 댓글 번호는 호환을 위해 유지한다');
select is(public.update_comment((current_setting('test.comment')::jsonb->>'id')::bigint,'고친 댓글')->>'author_nickname',current_setting('test.commenter_nickname'),'댓글 수정 응답도 닉네임을 유지한다');
select is((select c->>'author_nickname' from jsonb_array_elements(public.get_community_comments(current_setting('test.post')::bigint)) c where c->>'id'=current_setting('test.comment')::jsonb->>'id'),current_setting('test.commenter_nickname'),'댓글 목록의 닉네임이 등록 응답과 같다');
select ok(not (current_setting('test.comment')::jsonb ?| array['author_id','email','avatar_path']),'댓글 응답에도 계정 식별정보를 추가하지 않는다');

reset role;
select is((select body from private.notifications where event_key='comment:'||(current_setting('test.comment')::jsonb->>'id')),current_setting('test.commenter_nickname')||': 첫 댓글','새 댓글 알림은 번호 대신 생성 시점의 닉네임을 담는다');

set local role authenticated;
set local request.jwt.claims='{"sub":"19500000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.update_nickname('느긋한디기195'),null::text,'닉네임을 정상적으로 변경할 수 있다');
select is(public.get_community_post(current_setting('test.vote')::bigint)->>'author_nickname','느긋한디기195','기존 투표글에도 변경된 닉네임을 반환한다');
select is((select c->>'author_nickname' from jsonb_array_elements(public.get_community_comments(current_setting('test.post')::bigint)) c where c->>'id'=current_setting('test.comment')::jsonb->>'id'),'느긋한디기195','기존 댓글에도 변경된 닉네임을 반환한다');
select set_config('test.new_comment',public.create_comment(current_setting('test.post')::bigint,'새 댓글',gen_random_uuid())::text,true);
reset role;
select is((select body from private.notifications where event_key='comment:'||(current_setting('test.new_comment')::jsonb->>'id')),'느긋한디기195: 새 댓글','변경 후 생성되는 알림에는 새 닉네임을 담는다');

set local role authenticated;
set local request.jwt.claims='{"sub":"19500000-0000-0000-0000-000000000001","role":"authenticated"}';
select set_config('test.author_comment',public.create_comment(current_setting('test.post')::bigint,'작성자 댓글',gen_random_uuid())::text,true);
select is(current_setting('test.author_comment')::jsonb->>'author_nickname',current_setting('test.author_nickname'),'작성자 댓글에도 동일한 닉네임을 반환한다');
select is(current_setting('test.author_comment')::jsonb->>'is_post_author','true','작성자 구분은 그대로 유지한다');
reset role;

insert into private.user_blocks(blocker_id,blocked_id) values ('19500000-0000-0000-0000-000000000002','19500000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claims='{"sub":"19500000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.get_community_post(current_setting('test.post')::bigint),null::jsonb,'닉네임 조인이 작성자 차단을 우회하지 않는다');
reset role;

delete from auth.users where id='19500000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims='{"sub":"19500000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select c->>'author_nickname' from jsonb_array_elements(public.get_community_comments(current_setting('test.post')::bigint)) c where c->>'id'=current_setting('test.comment')::jsonb->>'id'),null::text,'탈퇴한 작성자의 닉네임은 반환하지 않는다');
select is((select c->>'content' from jsonb_array_elements(public.get_community_comments(current_setting('test.post')::bigint)) c where c->>'id'=current_setting('test.comment')::jsonb->>'id'),null::text,'탈퇴 댓글의 본문 비공개를 유지한다');
reset role;

select * from finish();
rollback;
