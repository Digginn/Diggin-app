begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(40);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev');

-- 가입 트리거
select is(
  (select count(*) from public.profiles where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  2::bigint,
  '가입하면 프로필이 생긴다'
);
select ok(
  (select private.nickname_error(nickname, id) is null from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  '랜덤 닉네임은 직접 변경 규칙을 통과한다'
);
select ok(
  (select nickname ~ '^[가-힣]{2,4}디기[1-9][0-9]{0,3}$' from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  '랜덤 닉네임은 형용사 + 디기 + 숫자 형식이다'
);
select is(
  (select count(*) from public.folders where user_id = '00000000-0000-0000-0000-00000000000a' and kind = 'owned' and name = '나의 소장템'),
  1::bigint,
  '가입하면 나의 소장템이 하나 생긴다'
);

-- 글자 수
select is(private.char_count('👍🏻'), 1, '피부색 이모지는 1자');
select is(private.char_count('👨‍👩‍👧'), 1, 'ZWJ 가족 이모지는 1자');
select is(private.char_count('🇰🇷'), 1, '국기는 1자');
select is(private.char_count('맥북 파우치'), 6, '한글과 공백은 그대로 센다');
select is(private.char_count('1️⃣2️⃣3️⃣4️⃣'), 4, '키캡 이모지는 1자');
select is(private.char_count('🏴󠁧󠁢󠁥󠁮󠁧󠁿'), 1, '태그 국기는 1자');

-- AUTH-008 검사 순서
insert into private.nickname_banned_words (word, kind) values ('바보', 'profanity');
insert into private.nickname_allowed_words (word) values ('바보온달');
select is(private.nickname_error('가', null), 'length', '1자는 글자 수 오류');
select is(private.nickname_error('가 나다', null), 'whitespace', '공백 오류');
select is(private.nickname_error('가나!', null), 'invalid_characters', '특수문자 오류');
select is(private.nickname_error('너바보야', null), 'profanity', '금칙어 오류');
select is(private.nickname_error('바보온달', null), null, 'allowlist 단어는 통과');
select is(private.nickname_error('바보온달바보', null), 'profanity', 'allowlist 밖의 금칙어는 걸린다');
select is(private.nickname_error('바보바보온달', null), 'profanity', 'allowlist 앞의 금칙어도 걸린다');
select is(private.nickname_error('DIGGIN', null), 'impersonation', '브랜드명과 정확히 같으면 사칭');
select is(private.nickname_error('디긴공식', null), 'impersonation', '브랜드명+공식은 사칭');
select is(private.nickname_error('디긴좋아요', null), null, '브랜드명+일반 단어는 허용');
select is(private.nickname_error('admin123', null), 'impersonation', 'admin 포함은 사칭');

insert into public.legal_policies (kind, version, effective_at, document_url, requires_reconsent)
values ('privacy', '2', now() - interval '1 day', 'https://example.com/privacy/2', true);

set local role anon;
select throws_ok($$ select * from public.get_pending_policies() $$, '42501', null, '비회원은 재동의 목록을 부를 수 없다');
select is((select count(*) from public.legal_policies), 1::bigint, '비회원도 약관 문서는 볼 수 있다');
reset role;

-- 사용자 A로 접속
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

select is((select count(*) from public.profiles), 1::bigint, '본인 프로필만 보인다');
select is(public.update_nickname('위시러버'), null, '닉네임을 바꿀 수 있다');
select is((select nickname from public.profiles), '위시러버', '바뀐 닉네임이 저장된다');

select throws_ok(
  $$ update public.profiles set status = 'active' $$,
  '42501',
  null,
  '프로필을 직접 고칠 수 없다'
);
select throws_ok(
  $$ select public.set_avatar('00000000-0000-0000-0000-00000000000b/avatar.webp') $$,
  '22023',
  null,
  '남의 경로를 프로필 이미지로 쓸 수 없다'
);
select lives_ok(
  $$ select public.set_avatar('00000000-0000-0000-0000-00000000000a/avatar.webp') $$,
  '본인 경로는 프로필 이미지로 쓸 수 있다'
);

select lives_ok($$ insert into public.folders (name) values (' 바지 ') $$, '일반 폴더를 만들 수 있다');
select is((select name from public.folders where kind = 'custom'), '바지', '폴더명은 앞뒤 공백을 지운다');
select throws_ok($$ insert into public.folders (name) values ('바지') $$, '23505', null, '같은 이름 폴더는 만들 수 없다');
update public.folders set name = '바꿈' where kind = 'owned';
select is(
  (select name from public.folders where kind = 'owned'),
  '나의 소장템',
  '나의 소장템은 고칠 수 없다'
);

select lives_ok($$ select public.register_push_token('token-1', 'ios') $$, 'push 토큰을 등록할 수 있다');

select is((select count(*) from public.get_pending_policies()), 1::bigint, '재동의가 필요한 약관이 보인다');
select public.accept_policy((select id from public.legal_policies where kind = 'privacy'));
select is((select count(*) from public.get_pending_policies()), 0::bigint, '동의하면 목록에서 빠진다');

-- 사용자 B로 접속
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

select is(public.update_nickname('위시러버'), 'duplicate', '다른 사람 닉네임은 쓸 수 없다');
select is(public.update_nickname('WISHLOVER'), null, '영문 닉네임을 바꿀 수 있다');
select is(
  (select count(*) from public.folders where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  '남의 폴더는 보이지 않는다'
);

-- 같은 기기 토큰으로 계정을 바꾸면 토큰이 옮겨간다
select public.register_push_token('token-1', 'ios');
reset role;
select is(
  (select user_id from public.push_tokens where token = 'token-1'),
  '00000000-0000-0000-0000-00000000000b'::uuid,
  '같은 토큰은 마지막으로 로그인한 계정으로 옮겨간다'
);

select * from finish();
rollback;
