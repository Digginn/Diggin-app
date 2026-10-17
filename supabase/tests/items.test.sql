begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(41);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev');

-- 입력 검사 함수(CSV 가져오기도 같이 쓴다)
select is(private.product_input_error('https://a.com/1', '상품', null, 0), null, '정상 입력은 통과');
select is(private.product_input_error('http://a.com/1', '상품', null, null), 'invalid_url', 'http는 거부');
select is(private.product_input_error(null, '상품', null, null), 'invalid_url', '링크 없음은 거부');
select is(private.product_input_error('https://a.com/1', '  ', null, null), 'name_required', '공백뿐인 상품명은 거부');
select is(private.product_input_error('https://a.com/1', repeat('가', 101), null, null), 'name_too_long', '상품명 101자는 거부');
select is(private.product_input_error('https://a.com/1', repeat('가', 100), repeat('나', 30), null), null, '상품명 100자·브랜드 30자는 통과');
select is(private.product_input_error('https://a.com/1', '상품', repeat('나', 31), null), 'brand_too_long', '브랜드 31자는 거부');
select is(private.product_input_error('https://a.com/1', '상품', null, -1), 'invalid_price', '음수 가격은 거부');

set local role anon;
select throws_ok($$ select * from public.products $$, '42501', null, '비회원은 상품을 볼 수 없다');
select throws_ok(
  $$ select * from public.save_product('https://a.com/1', '상품', null, null, null, null, null) $$,
  '42501', null, '비회원은 상품을 저장할 수 없다'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

insert into public.folders (name) values ('바지'), ('상의');

select is(
  (select is_duplicate from public.save_product(
    ' https://shop.com/p/1 ', ' 데님 팬츠 ', '  ', 0, 'https://img.com/1.jpg', 'high',
    array[(select id from public.folders where name = '바지')]
  )),
  false,
  '새 상품을 저장한다'
);
select is(
  (select row(url, name, brand, price, wish_level)::text from public.products),
  row('https://shop.com/p/1', '데님 팬츠', null::text, 0, 'high'::public.wish_level)::text,
  '링크·상품명은 앞뒤 공백을 빼고, 빈 브랜드는 null, 0원은 0으로 저장한다'
);
select is(
  (select count(*) from public.product_folders pf join public.folders f on f.id = pf.folder_id where f.name = '바지'),
  1::bigint,
  '고른 폴더에 담긴다'
);
select isnt(
  (select last_added_at from public.folders where name = '바지'),
  null,
  '폴더에 담으면 last_added_at이 바뀐다'
);
select is(
  (select row(product_id, is_duplicate)::text from public.save_product(
    'https://shop.com/p/1', '다른 이름', null, null, null, null, null
  )),
  (select row(id, true)::text from public.products),
  '같은 링크는 저장하지 않고 기존 상품 id를 돌려준다'
);
select is((select count(*) from public.products), 1::bigint, '중복 저장은 상품을 늘리지 않는다');
select throws_ok(
  $$ select * from public.save_product('http://shop.com/p/2', '상품', null, null, null, null, null) $$,
  '22023', 'invalid_url', 'https가 아니면 저장하지 않는다'
);
select throws_ok(
  $$ select * from public.save_product('https://shop.com/p/2', '', null, null, null, null, null) $$,
  '22023', 'name_required', '상품명이 없으면 저장하지 않는다'
);
select throws_ok(
  $$ insert into public.products (url, name) values ('https://shop.com/p/3', '상품') $$,
  '42501', null, '상품을 직접 만들 수 없다'
);
select throws_ok(
  $$ update public.products set url = 'https://shop.com/other' $$,
  '42501', null, '링크는 고칠 수 없다(PDT-006)'
);
select throws_ok(
  $$ update public.products set image_url = 'https://img.com/other.jpg' $$,
  '42501', null, '대표 이미지는 고칠 수 없다(PDT-006)'
);
select lives_ok($$ update public.products set name = '와이드 데님', price = null $$, '상품명·가격은 고칠 수 있다');
select lives_ok(
  $$ insert into public.product_folders (product_id, folder_id)
     values ((select id from public.products), (select id from public.folders where name = '상의')) $$,
  '일반 폴더에 직접 담을 수 있다'
);
update public.products set wish_level = null;
select throws_ok(
  $$ insert into public.product_folders (product_id, folder_id)
     values ((select id from public.products), (select id from public.folders where kind = 'owned')) $$,
  '42501', null, '나의 소장템은 직접 담을 수 없다'
);

-- PDT-008 나의 소장템
select lives_ok($$ select public.set_owned((select id from public.products), true) $$, '소장템에 넣을 수 있다');
select is(
  (select row(p.wish_level is null, count(pf.folder_id))::text
   from public.products p join public.product_folders pf on pf.product_id = p.id group by p.wish_level),
  row(true, 3::bigint)::text,
  '소장템에 넣으면 위시레벨이 비고 기존 폴더는 유지된다'
);
select throws_ok(
  $$ update public.products set wish_level = 'low' $$,
  'P0001', 'owned_product_wish_level', '소장템 상품에는 위시레벨을 넣을 수 없다'
);
select lives_ok($$ select public.set_owned((select id from public.products), false) $$, '위시레벨 없이 소장을 해제할 수 있다');
select is(
  (select row(p.wish_level is null, (select count(*) from public.product_folders pf join public.folders f on f.id = pf.folder_id where f.kind = 'owned'))::text
   from public.products p),
  row(true, 0::bigint)::text,
  '위시레벨 없이 해제하면 미선택으로 두고 소장템에서 뺀다'
);
select lives_ok($$ select public.set_owned((select id from public.products), true) $$, '다시 소장템에 넣는다');
select lives_ok($$ select public.set_owned((select id from public.products), false, true, 'medium') $$, '새 위시레벨로 소장을 해제한다');
select is(
  (select row(p.wish_level, (select count(*) from public.product_folders pf join public.folders f on f.id = pf.folder_id where f.kind = 'owned'))::text
   from public.products p),
  row('medium'::public.wish_level, 0::bigint)::text,
  '소장 해제하면 새 위시레벨이 들어가고 소장템에서 빠진다'
);
select lives_ok($$ select public.set_owned((select id from public.products), true, false) $$, '기존 폴더를 지우며 소장템에 넣는다');
select is(
  (select array_agg(f.kind) from public.product_folders pf join public.folders f on f.id = pf.folder_id),
  array['owned'::public.folder_kind],
  '기존 폴더 삭제를 고르면 소장템만 남는다'
);
select is(
  (select wish_level from public.products p
   join public.save_product('https://shop.com/p/4', '소장품', null, null, null, 'high',
     array[(select id from public.folders where kind = 'owned')]) s on s.product_id = p.id),
  null,
  '저장할 때 소장템을 고르면 위시레벨을 비운다'
);

select set_config('test.a_folder', (select id::text from public.folders where name = '상의'), true);
select set_config('test.a_product', (select id::text from public.products where url = 'https://shop.com/p/4'), true);
select lives_ok($$ delete from public.products where url = 'https://shop.com/p/1' $$, '상품을 지울 수 있다');
select is(
  (select count(*) from public.product_folders),
  1::bigint,
  '상품을 지우면 그 상품의 폴더 관계도 지워진다'
);

-- 다른 사용자
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is((select count(*) from public.products), 0::bigint, '남의 상품은 보이지 않는다');
select throws_ok(
  $$ select * from public.save_product('https://shop.com/p/9', '상품', null, null, null, null,
       array[current_setting('test.a_folder')::bigint]) $$,
  '23503', null, '남의 폴더에는 담을 수 없다'
);
select throws_ok(
  $$ select public.set_owned(current_setting('test.a_product')::bigint, true) $$,
  '22023', 'product_not_found', '남의 상품은 소장 처리할 수 없다'
);
delete from public.products;
reset role;
select is((select count(*) from public.products where user_id = '00000000-0000-0000-0000-00000000000a'), 1::bigint, '남의 상품은 지울 수 없다');

select finish();
rollback;
