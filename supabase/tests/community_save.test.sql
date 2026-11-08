begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
 ('98000000-0000-0000-0000-000000000001', 'snapshot-author@test.dev'),
 ('98000000-0000-0000-0000-000000000002', 'snapshot-saver@test.dev');
insert into private.posts(author_id, type, content)
 values ('98000000-0000-0000-0000-000000000001', 'post', '상품 Snapshot 저장 테스트');
select set_config('test.post', (select max(id)::text from private.posts), true);
insert into private.post_products(post_id, position, name, brand, price, url, image_url)
 values (current_setting('test.post')::bigint, 1, '게시 시점 이름', '게시 브랜드', null,
         'https://shop.test/snapshot', 'https://shop.test/image.jpg');

set local role authenticated;
set local request.jwt.claims = '{"sub":"98000000-0000-0000-0000-000000000002","role":"authenticated"}';
insert into public.folders(name) values ('가방'), ('의류');
select set_config('test.snapshot', (public.get_community_post(current_setting('test.post')::bigint)->'items'->0)::text, true);

select is((select is_duplicate from public.save_product(
  current_setting('test.snapshot')::jsonb->>'url', '내가 바꾼 이름', '내 브랜드', null,
  current_setting('test.snapshot')::jsonb->>'image_url', 'high',
  array[(select id from public.folders where name = '가방')]
)), false, '게시 시점 Snapshot을 내 독립 상품으로 저장한다');
select is((select row(name, brand, price, image_url, wish_level)::text from public.products),
 row('내가 바꾼 이름', '내 브랜드', null::integer, 'https://shop.test/image.jpg', 'high'::public.wish_level)::text,
 '수정 정보와 Snapshot 이미지·null 가격을 저장한다');
select is((select array_agg(f.name) from public.product_folders pf join public.folders f on f.id = pf.folder_id),
 array['가방'], '선택한 폴더에만 연결한다');

select is((select is_duplicate from public.save_product(
 'https://shop.test/snapshot', '덮어쓸 이름', null, 100, 'https://shop.test/other.jpg', null,
 array[(select id from public.folders where name = '의류')]
)), true, '중복 URL은 기존 상품을 반환한다');
select is((select name from public.products), '내가 바꾼 이름', '중복 저장은 기존 정보를 덮어쓰지 않는다');
select is((select count(*) from public.product_folders), 1::bigint, '중복 저장은 폴더 관계도 바꾸지 않는다');

update public.products set name = '저장 후 변경', brand = null;
select is(public.get_community_post(current_setting('test.post')::bigint)->'items'->0->>'name',
 '게시 시점 이름', '내 상품 수정은 게시글 Snapshot을 바꾸지 않는다');
select throws_ok($$update public.products set image_url = 'https://shop.test/changed.jpg'$$,
 '42501', null, '저장된 이미지도 사용자 변경을 허용하지 않는다');
delete from public.products;
select is(public.get_community_post(current_setting('test.post')::bigint)->'items'->0->>'name',
 '게시 시점 이름', '내 상품 삭제 후에도 Snapshot은 남는다');

select is((select is_duplicate from public.save_product('https://shop.test/all', 'ALL 전용', null, 0,
 null, 'medium', '{}'::bigint[])), false, '폴더 미선택 저장을 허용한다');
select is((select count(*) from public.product_folders), 0::bigint, '미선택 상품은 ALL에만 남는다');
select is((select price from public.products), 0, '입력한 0원은 null과 구분한다');

select is((select is_duplicate from public.save_product('https://shop.test/owned', '소장품', null, null,
 null, 'high', array(select id from public.folders where kind = 'owned' or name = '가방'))),
 false, '소장템과 일반 폴더를 함께 선택할 수 있다');
select is((select wish_level::text from public.products where url = 'https://shop.test/owned'),
 null::text, '소장템 저장은 위시레벨을 비운다');
select is((select count(*) from public.product_folders), 2::bigint, '선택한 두 폴더 모두 연결한다');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"98000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*) from public.products), 0::bigint, '글 작성자는 저장한 사람의 상품을 볼 수 없다');

select * from finish();
rollback;
