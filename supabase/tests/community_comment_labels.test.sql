begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('22700000-0000-0000-0000-000000000001','label-author@test.dev'),
 ('22700000-0000-0000-0000-000000000002','label-operator@test.dev'),
 ('22700000-0000-0000-0000-000000000003','label-disabled@test.dev'),
 ('22700000-0000-0000-0000-000000000004','label-voter@test.dev');
insert into private.admin_users(id,email,role,disabled_at) values
 ('22700000-0000-0000-0000-000000000002','label-operator@test.dev','operator',null),
 ('22700000-0000-0000-0000-000000000003','label-disabled@test.dev','super_admin',now());
insert into private.posts(author_id,type,content) values
 ('22700000-0000-0000-0000-000000000001','post','일반 댓글 라벨 테스트');
select set_config('test.post',(select id::text from private.posts where content='일반 댓글 라벨 테스트'),true);
insert into private.posts(author_id,type,content,ends_at) values
 ('22700000-0000-0000-0000-000000000001','vote','투표 댓글 라벨 테스트',now()+interval '24 hours');
select set_config('test.vote',(select id::text from private.posts where content='투표 댓글 라벨 테스트'),true);

set local role anon;
select throws_ok($$select public.get_community_comments(current_setting('test.post')::bigint)$$,'42501',null,'비회원에게 댓글 라벨을 공개하지 않는다');

set local role authenticated;
set local request.jwt.claims='{"sub":"22700000-0000-0000-0000-000000000002","role":"authenticated"}';
select set_config('test.operator',public.create_comment(current_setting('test.post')::bigint,'운영자 댓글',gen_random_uuid())::text,true);
select is(current_setting('test.operator')::jsonb->>'is_operator','true','활성 운영자는 등록 응답에서 표시한다');
select is(current_setting('test.operator')::jsonb->>'vote_choice',null::text,'일반글에는 투표 라벨이 없다');
select is(public.update_comment((current_setting('test.operator')::jsonb->>'id')::bigint,'운영자 수정')->>'is_operator','true','수정 응답도 운영자를 표시한다');
select ok(not(current_setting('test.operator')::jsonb ?| array['author_id','email','role','admin_id']),'관리자 계정의 식별정보와 권한은 반환하지 않는다');
select set_config('test.operator_vote',public.create_comment(current_setting('test.vote')::bigint,'투표 운영자 댓글',gen_random_uuid())::text,true);
select is(current_setting('test.operator_vote')::jsonb->>'vote_choice',null::text,'투표하지 않은 운영자는 선택이 없다');
select public.set_community_vote(current_setting('test.vote')::bigint,'buy');
select is(public.get_community_comments(current_setting('test.vote')::bigint)->0->>'is_operator','true','운영자의 투표 참여가 운영자 구분을 지우지 않는다');
select is(public.get_community_comments(current_setting('test.vote')::bigint)->0->>'vote_choice','buy','운영자 투표 선택도 서버에서 조회한다');

set local request.jwt.claims='{"sub":"22700000-0000-0000-0000-000000000003","role":"authenticated"}';
select set_config('test.disabled',public.create_comment(current_setting('test.post')::bigint,'비활성 관리자 댓글',gen_random_uuid())::text,true);
select is(current_setting('test.disabled')::jsonb->>'is_operator','false','비활성 관리자에게 운영자 라벨을 주지 않는다');
reset role;
update private.admin_users set disabled_at=null where id='22700000-0000-0000-0000-000000000003';
set local role authenticated;
select is(public.update_comment((current_setting('test.disabled')::jsonb->>'id')::bigint,'활성 관리자 수정')->>'is_operator','true','활성 super_admin도 운영자로 표시한다');
reset role;
update private.admin_users set disabled_at=now() where id='22700000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select c->>'is_operator' from jsonb_array_elements(public.get_community_comments(current_setting('test.post')::bigint)) c where c->>'id'=current_setting('test.operator')::jsonb->>'id'),'false','관리자 비활성화가 기존 댓글 조회에도 반영된다');

set local request.jwt.claims='{"sub":"22700000-0000-0000-0000-000000000004","role":"authenticated"}';
select set_config('test.voter',public.create_comment(current_setting('test.vote')::bigint,'일반 회원 댓글',gen_random_uuid())::text,true);
select is(current_setting('test.voter')::jsonb->>'is_operator','false','일반 회원은 운영자가 아니다');
select is(current_setting('test.voter')::jsonb->>'vote_choice',null::text,'미참여 댓글에는 투표 라벨이 없다');
select public.set_community_vote(current_setting('test.vote')::bigint,'buy');
select is((select c->>'vote_choice' from jsonb_array_elements(public.get_community_comments(current_setting('test.vote')::bigint)) c where c->>'id'=current_setting('test.voter')::jsonb->>'id'),'buy','댓글 등록 뒤 투표한 BUY 선택을 조회한다');
select public.set_community_vote(current_setting('test.vote')::bigint,'not');
select is(public.update_comment((current_setting('test.voter')::jsonb->>'id')::bigint,'선택 변경 후 수정')->>'vote_choice','not','수정 응답은 변경된 NOT 선택을 반환한다');
select is(public.create_comment(current_setting('test.vote')::bigint,'선택 후 새 댓글',gen_random_uuid())->>'vote_choice','not','투표 뒤 등록 응답에도 NOT 선택을 반환한다');
select is(public.create_comment(current_setting('test.post')::bigint,'일반글 새 댓글',gen_random_uuid())->>'vote_choice',null::text,'다른 투표글에 참여해도 일반글에는 선택이 없다');

set local request.jwt.claims='{"sub":"22700000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select c->>'vote_choice' from jsonb_array_elements(public.get_community_comments(current_setting('test.vote')::bigint)) c where c->>'id'=current_setting('test.voter')::jsonb->>'id'),'not','다른 회원도 댓글 작성자의 현재 선택을 볼 수 있다');
select is(public.get_community_post(current_setting('test.vote')::bigint)->>'buy_count',null::text,'진행 중 미참여자의 투표 집계는 계속 비공개다');
reset role;
delete from auth.users where id='22700000-0000-0000-0000-000000000004';
set local role authenticated;
select is((select c->>'vote_choice' from jsonb_array_elements(public.get_community_comments(current_setting('test.vote')::bigint)) c where c->>'id'=current_setting('test.voter')::jsonb->>'id'),null::text,'탈퇴 댓글에는 투표 선택을 반환하지 않는다');
select is((select c->>'is_operator' from jsonb_array_elements(public.get_community_comments(current_setting('test.vote')::bigint)) c where c->>'id'=current_setting('test.voter')::jsonb->>'id'),'false','탈퇴 댓글에는 운영자 라벨을 반환하지 않는다');
reset role;

select * from finish();
rollback;
