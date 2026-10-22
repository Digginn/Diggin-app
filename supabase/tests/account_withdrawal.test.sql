begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

-- AUTH-008 korcen 사전
select is(private.nickname_error('시발놈', null), 'profanity', 'korcen 비속어는 걸린다');
select is(private.nickname_error('happyday', null), null, '사전에 없는 영문은 통과한다');
select is(private.nickname_error('Sibal', null), 'profanity', '영문은 대소문자를 가리지 않는다');
select is(private.nickname_error('시발점', null), null, 'korcen 오탐 목록의 정상 표현은 통과한다');
select is(private.nickname_error('개발자', null), null, '흔한 단어는 통과한다');
select is(private.nickname_error('느긋한디기12', null), null, '랜덤 닉네임 형식은 통과한다');

insert into auth.users (id, email) values
  ('12000000-0000-0000-0000-000000000001', 'leave@test.dev'),
  ('12000000-0000-0000-0000-000000000002', 'stay@test.dev');
insert into private.posts(author_id, type, content) values
  ('12000000-0000-0000-0000-000000000002', 'post', '남는 사용자의 게시글');
select set_config('test.host', (select max(id)::text from private.posts), true);
insert into private.posts(author_id, type, content) values
  ('12000000-0000-0000-0000-000000000001', 'post', '탈퇴할 사용자의 게시글');
insert into private.comments(post_id, author_id, content) values
  (current_setting('test.host')::bigint, '12000000-0000-0000-0000-000000000001', '탈퇴할 사용자 댓글'),
  (current_setting('test.host')::bigint, '12000000-0000-0000-0000-000000000002', '남는 사용자 댓글');

-- MY-007 계정 삭제
delete from auth.users where id = '12000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from private.comments where post_id = current_setting('test.host')::bigint),
  2::bigint,
  '탈퇴해도 다른 글의 댓글은 남는다'
);
select ok(
  (select author_id is null and content is null from private.comments
   where post_id = current_setting('test.host')::bigint and author_id is distinct from '12000000-0000-0000-0000-000000000002'),
  '탈퇴한 사용자 댓글은 작성자와 내용을 비운다'
);
select is(
  (select content from private.comments where author_id = '12000000-0000-0000-0000-000000000002'),
  '남는 사용자 댓글',
  '다른 사용자 댓글은 그대로다'
);
select is(
  (select count(*) from private.posts where content = '탈퇴할 사용자의 게시글'),
  0::bigint,
  '탈퇴한 사용자 게시글은 지운다'
);

-- 탈퇴 설문은 Edge Function(service_role)만 남긴다
set local role authenticated;
set local request.jwt.claims = '{"sub":"12000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.record_withdrawal_survey('{rarely_used}', null) $$,
  '42501', null, '로그인 사용자는 설문을 직접 남길 수 없다'
);
reset role;

set local role service_role;
select lives_ok(
  $$ select public.record_withdrawal_survey('{rarely_used,hard_to_use}', '  ') $$,
  'service_role은 설문을 남긴다'
);
select throws_ok(
  $$ select public.record_withdrawal_survey('{}', ' ') $$,
  '23514', null, '사유도 직접 작성도 없으면 남기지 않는다'
);
reset role;
select ok(
  (select reasons = '{rarely_used,hard_to_use}' and custom_text is null
   from private.withdrawal_surveys order by id desc limit 1),
  '빈 직접 작성은 비워서 남긴다'
);

select * from finish();
rollback;
