begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select ok(private.is_restricted_product('ADULT 상품'), '영문 대소문자 무시');
select ok(private.is_restricted_product('ＳＥＸ　ＴＯＹ'), '전각·공백 정규화');
select ok(private.is_restricted_product('운동화', array['청소년 구매불가']), '상품명에 없어도 연령 표시 차단');
select ok(not private.is_restricted_product('미술 도구'), '단독 술 제외로 미술 상품 허용');
select ok(not private.is_restricted_product('1954 모델'), '단독 19 제외로 모델명 허용');
select ok(not private.is_restricted_product('2019 한정판'), '상품명의 연도 허용');
select ok(not private.is_restricted_product('운동화', array['신발']), '일반 상품 통과');

insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000000a', 'restricted@test.dev');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select lives_ok($$select * from public.save_product('https://shop.test/model', '1954 미술 도구')$$,
  '이전 오탐 상품도 실제 저장 경로에서 허용');
select throws_ok($$select * from public.save_product('https://shop.test/adult', '성인 상품')$$,
  '22023', 'restricted_product', '이전 앱의 7인자 기본 호출도 상품명을 검사');
select throws_ok($$select * from public.save_product('https://shop.test/category', '선물', null, null, null, null, null, array['주류'])$$,
  '22023', 'restricted_product', '카테고리를 전달한 저장도 차단');
select lives_ok($$select * from public.save_product('https://shop.test/shoes', '운동화')$$, '일반 상품은 저장');
select lives_ok($$select * from public.save_product('https://shop.test/bounded', '선물', null, null, null, null, null,
  array_fill(repeat('가', 101), array[12]))$$, '긴 일반 카테고리는 잘라 저장');
select is((select cardinality(restriction_labels) from public.products where url='https://shop.test/bounded'), 10,
  'RPC를 직접 호출해도 최대 10개 저장');
select is((select max(char_length(label)) from public.products p cross join unnest(p.restriction_labels) as label
  where p.url='https://shop.test/bounded'), 100, '각 표시는 최대 100자 저장');
select throws_ok($$select * from public.save_product('https://shop.test/late-label', '선물', null, null, null, null, null,
  array_fill('의류'::text, array[10]) || array['주류'])$$,
  '22023', 'restricted_product', '11번째 표시의 제한 키워드도 자르기 전에 차단');
select throws_ok($$select * from public.save_product('https://shop.test/late-text', '선물', null, null, null, null, null,
  array[repeat('가', 100) || '전자담배'])$$,
  '22023', 'restricted_product', '100자 뒤의 제한 키워드도 자르기 전에 차단');
select throws_ok($$update public.products set name='전자담배' where url='https://shop.test/shoes'$$,
  '22023', 'restricted_product', '직접 REST 수정도 트리거에서 차단');
select throws_ok($$update public.products set restriction_labels='{}' where url='https://shop.test/shoes'$$,
  '42501', null, '사용자는 저장된 카테고리·연령 표시를 지울 수 없다');

create function pg_temp.restricted_csv() returns jsonb language sql as $$
  select public.import_csv('10000000-0000-0000-0000-000000000157', jsonb_build_object(
    'userId', auth.uid(), 'totalCount', 3, 'folderMappings', '[]'::jsonb,
    'failures', '[]'::jsonb, 'duplicates', '[]'::jsonb,
    'products', jsonb_set('[
      {"rowNumber":2,"name":"와인","url":"https://shop.test/wine","sourceFolderNames":[],"isOwned":false,"savedAt":"2026-10-28T00:00:00Z"},
      {"rowNumber":3,"name":"선물","url":"https://shop.test/gift","restrictionLabels":["성인인증"],"sourceFolderNames":[],"isOwned":false,"savedAt":"2026-10-28T00:00:00Z"},
      {"rowNumber":4,"name":"가방","url":"https://shop.test/bag","sourceFolderNames":[],"isOwned":false,"savedAt":"2026-10-28T00:00:00Z"}
    ]'::jsonb, '{2,restrictionLabels}', to_jsonb(array_fill(repeat('가', 101), array[12])))));
$$;
select is((pg_temp.restricted_csv()->>'importedCount')::integer, 1, '클라이언트 검사를 우회한 CSV도 정상 상품만 저장');
select is((select cardinality(restriction_labels) from public.products where url='https://shop.test/bag'), 10,
  'CSV 직접 호출도 최대 10개 저장');
select is((select max(char_length(label)) from public.products p cross join unnest(p.restriction_labels) as label
  where p.url='https://shop.test/bag'), 100, 'CSV의 긴 일반 카테고리도 최대 100자 저장');
select is((select count(*)::integer from public.import_failures where reason='RESTRICTED_PRODUCT'), 2,
  '제한 상품 둘은 사유를 기록하고 전체 가져오기를 롤백하지 않는다');
select is((select count(*)::integer from public.products where url in ('https://shop.test/wine','https://shop.test/gift')), 0,
  '제한 CSV 상품은 DB에 존재하지 않는다');
reset role;
select throws_ok($$insert into public.products(user_id,url,name) values ('00000000-0000-0000-0000-00000000000a','https://shop.test/direct','맥주')$$,
  '22023', 'restricted_product', '서버 직접 INSERT도 차단');
select * from finish();
rollback;
