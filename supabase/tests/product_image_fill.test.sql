begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('96000000-0000-0000-0000-000000000001','fill-a@test.dev'),
 ('96000000-0000-0000-0000-000000000002','fill-b@test.dev');
-- CSV 상품은 image_checked_at이 null로 들어간다.
insert into public.products(user_id,url,name) select '96000000-0000-0000-0000-000000000001','https://fill.test/'||n,'상품'||n from generate_series(1,4) n;
insert into public.products(user_id,url,name) values ('96000000-0000-0000-0000-000000000002','https://fill.test/other','남의 상품');
select set_config('test.p',(select array_agg(id order by id)::text from public.products where user_id='96000000-0000-0000-0000-000000000001'),true);
select set_config('test.other',(select id::text from public.products where user_id='96000000-0000-0000-0000-000000000002'),true);

set local role anon;
select throws_ok($$select public.fill_product_image(1,'https://img.test/a.png')$$,'42501',null,'비회원 호출 차단');
set local role authenticated;
set local request.jwt.claims = '{"sub":"96000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.fill_product_image((current_setting('test.p')::bigint[])[1],'https://img.test/a.png'),'https://img.test/a.png','비어 있는 CSV 상품 이미지 채움');
select is(public.fill_product_image((current_setting('test.p')::bigint[])[1],'https://img.test/b.png'),'https://img.test/a.png','채운 이미지는 다시 바꾸지 않음');
select is(public.fill_product_image((current_setting('test.p')::bigint[])[2],null),null,'못 읽으면 null로 시도만 기록');
select is(public.fill_product_image((current_setting('test.p')::bigint[])[2],'https://img.test/c.png'),null,'시도한 상품은 다시 채우지 않음');
select throws_ok($$select public.fill_product_image((current_setting('test.p')::bigint[])[3],'http://img.test/a.png')$$,'22023','invalid_image_url','https가 아닌 주소 거부');
select throws_ok($$select public.fill_product_image((current_setting('test.p')::bigint[])[3],'javascript:alert(1)')$$,'22023','invalid_image_url','스크립트 주소 거부');
select throws_ok($$select public.fill_product_image(current_setting('test.other')::bigint,'https://img.test/a.png')$$,'42501','product_not_found','남의 상품 차단');
select throws_ok($$update public.products set image_url='https://img.test/x.png' where id=(current_setting('test.p')::bigint[])[3]$$,'42501',null,'직접 이미지 수정 불가');
reset role;
select ok((select image_checked_at is not null from public.products where id=(current_setting('test.p')::bigint[])[2]),'실패도 시도 시각 기록');
select is((select image_url from public.products where id=current_setting('test.other')::bigint),null,'남의 상품은 그대로');
select is((select image_url from public.products where id=(current_setting('test.p')::bigint[])[3]),null,'거부된 주소는 저장 안 됨');

set local role authenticated;
select set_config('test.saved',(select product_id::text from public.save_product('https://fill.test/link','링크 상품')),true);
reset role;
select ok((select image_checked_at is not null from public.products where id=current_setting('test.saved')::bigint),'링크 저장 상품은 채우기 대상이 아님');
set local role authenticated;
select is(public.fill_product_image(current_setting('test.saved')::bigint,'https://img.test/d.png'),null,'링크 저장 상품 이미지는 바꾸지 않음(PDT-006)');
reset role;

update public.profiles set status='suspended',suspended_at=now() where id='96000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select public.fill_product_image((current_setting('test.p')::bigint[])[4],'https://img.test/e.png')$$,'42501',null,'이용 중단 계정 차단');
select * from finish();
rollback;
