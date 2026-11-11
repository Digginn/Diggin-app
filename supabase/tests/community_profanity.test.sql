begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select ok(private.contains_community_profanity('시발 이게 뭐야'), '기존 비속어 사전을 공유한다');
select ok(private.contains_community_profanity('SIbal'), '영문 대소문자 변형을 검사한다');
select ok(private.contains_community_profanity('ＳＩＢＡＬ'), '전각 영문을 검사한다');
select ok(private.contains_community_profanity(E'시 \n발'), '공백·줄바꿈으로 나눈 비속어를 검사한다');
select ok(private.contains_community_profanity(U&'시\200B발'), '제로폭 문자를 끼운 비속어를 검사한다');
select ok(private.contains_community_profanity(normalize('시발', NFD)), '분해된 한글을 검사한다');
select ok(not private.contains_community_profanity('시발점에서 출발해요'), '정상 표현 예외를 유지한다');
select ok(private.contains_community_profanity('시.발 이게 뭐야'), '기호를 끼운 비속어를 검사한다');
select ok(private.contains_community_profanity('시1발 이게 뭐야'), '숫자를 끼운 비속어를 검사한다');
select ok(private.contains_community_profanity('씨8 이게 뭐야'), '숫자가 든 사전 단어를 유지한다');
select ok(private.contains_community_profanity('ㅅㅂ 이게 뭐야'), '자모 약어를 검사한다');
select ok(private.contains_community_profanity('씨발 존나 비싸'), '추가한 비속어를 검사한다');
select ok(not private.contains_community_profanity('가격 10,000원 신발이에요'), '숫자·기호가 든 정상 문장은 허용한다');
select is(private.nickname_error('시1발', null), 'profanity', '닉네임도 같은 검사를 쓴다');
select ok(private.contains_community_profanity('시발점인데 시발'), '정상 표현 밖의 비속어는 차단한다');
select ok(not private.contains_community_profanity('관리자에게 문의했어요'), '닉네임 사칭 규칙은 본문에 적용하지 않는다');
select ok(not private.contains_community_profanity('오늘 옷 정말 예쁘네요 👍🏽'), '정상 문장과 이모지는 허용한다');
select ok(not private.contains_community_profanity(null), 'null은 기존 길이 검증에 맡긴다');
select ok(not has_function_privilege('anon', 'private.contains_community_profanity(text)', 'execute'), '비회원 검사 함수 직접 호출 차단');
select ok(not has_function_privilege('authenticated', 'private.contains_community_profanity(text)', 'execute'), '회원 검사 함수 직접 호출 차단');

insert into auth.users(id, email) values
 ('18300000-0000-0000-0000-000000000001', 'profanity-author@test.dev'),
 ('18300000-0000-0000-0000-000000000002', 'profanity-commenter@test.dev');
insert into public.products(user_id, url, name)
values ('18300000-0000-0000-0000-000000000001', 'https://profanity.test/item', '테스트 상품');
select set_config('test.product', (select id::text from public.products where url='https://profanity.test/item'), true);
set local request.jwt.claims = '{"sub":"18300000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select public.agree_community_policy();
select throws_ok($$select public.create_post('post','시발 이게 뭐야',array[current_setting('test.product')::bigint],gen_random_uuid())$$,
 '22023','community_profanity','일반글 RPC에서 금칙어 차단');
select throws_ok($$select public.create_post('vote','시발 이걸 살까',array[current_setting('test.product')::bigint],gen_random_uuid())$$,
 '22023','community_profanity','투표글 RPC에서 금칙어 차단');
select set_config('test.post', public.create_post('post','오늘 이 옷 어떤가요',array[current_setting('test.product')::bigint],gen_random_uuid()), true);
select set_config('test.vote', public.create_post('vote','관리자에게 문의했어요',array[current_setting('test.product')::bigint],gen_random_uuid()), true);
select throws_ok($$select public.create_comment(current_setting('test.post')::bigint,'시발',gen_random_uuid())$$,
 '22023','community_profanity','작성자 댓글도 금칙어 차단');
reset role;
set local request.jwt.claims = '{"sub":"18300000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok($$select public.create_comment(current_setting('test.post')::bigint,'시발',gen_random_uuid())$$,
 '22023','community_profanity','일반글 댓글 금칙어 차단');
select throws_ok($$select public.create_comment(current_setting('test.vote')::bigint,'시발',gen_random_uuid())$$,
 '22023','community_profanity','투표글 댓글 금칙어 차단');
select set_config('test.comment', public.create_comment(current_setting('test.post')::bigint,'시발점에서 출발해요',gen_random_uuid())->>'id', true);
select throws_ok($$select public.update_comment(current_setting('test.comment')::bigint,'시발')$$,
 '22023','community_profanity','댓글 수정으로 금칙어 우회 불가');
select lives_ok($$select public.update_comment(current_setting('test.comment')::bigint,'예쁜 상품이네요')$$, '정상 댓글 수정 허용');
select throws_ok($$select public.create_comment(current_setting('test.post')::bigint,'  ',gen_random_uuid())$$,
 '22023','invalid_comment_content','기존 공백 댓글 검증 유지');
select throws_ok($$select public.update_comment(current_setting('test.comment')::bigint,repeat('가',31))$$,
 '22023','invalid_comment_content','기존 댓글 길이 제한 유지');
reset role;
select is((select content from private.comments where id=current_setting('test.comment')::bigint),'예쁜 상품이네요','실패한 수정은 저장 본문을 바꾸지 않는다');
select is((select count(*)::integer from private.posts where author_id='18300000-0000-0000-0000-000000000001'),2,'금칙어 실패 글은 저장되지 않는다');
select is((select count(*)::integer from private.comments where post_id=current_setting('test.post')::bigint),1,'금칙어 실패 댓글은 저장되지 않는다');

select * from finish();
rollback;
