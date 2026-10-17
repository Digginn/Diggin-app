begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'csv-a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'csv-b@test.dev'),
  ('00000000-0000-0000-0000-00000000000c', 'csv-c@test.dev');

create function pg_temp.csv_plan(products jsonb, mappings jsonb default '[]', failures jsonb default '[]', duplicates jsonb default '[]')
returns jsonb language sql stable as $$
  select jsonb_build_object('userId', auth.uid(), 'totalCount', jsonb_array_length(products) + jsonb_array_length(failures) + jsonb_array_length(duplicates),
    'products', products, 'folderMappings', mappings, 'failures', failures, 'duplicates', duplicates);
$$;

set local role anon;
select throws_ok($$select public.import_csv('10000000-0000-0000-0000-000000000001', '{}')$$, '42501', null, '비회원은 CSV를 저장할 수 없다');
select throws_ok($$select * from public.import_jobs$$, '42501', null, '비회원은 가져오기 기록을 볼 수 없다');
reset role;
set local role authenticated;
select throws_ok($$select public.import_csv('10000000-0000-0000-0000-000000000001', pg_temp.csv_plan('[]'))$$, '42501', 'not_authenticated', 'JWT 사용자가 없으면 definer에서도 거부한다');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into public.folders(name) values ('신발');
select * from public.save_product('https://shop.test/existing', '기존 상품', '기존 브랜드', 1200, 'https://image.test/a', 'high');
select set_config('test.existing_saved_at', (select saved_at::text from public.products where url='https://shop.test/existing'), true);
select set_config('test.plan', pg_temp.csv_plan(
  '[
    {"rowNumber":2,"name":"신규 상품","url":"https://shop.test/new","brand":null,"price":"0","savedAt":"2026-10-12T00:00:00Z","isOwned":false,"sourceFolderNames":["신발","선물"]},
    {"rowNumber":3,"name":"덮어쓰면 안 됨","url":"https://shop.test/existing","brand":null,"price":"99","savedAt":"2000-01-01T00:00:00Z","isOwned":true,"sourceFolderNames":["선물"]},
    {"rowNumber":4,"name":"잘못된 링크","url":"http://shop.test/invalid","savedAt":"2026-10-12T00:00:00Z","isOwned":false,"sourceFolderNames":[]}
  ]',
  '[{"sourceName":"신발","folderName":"신발"},{"sourceName":"선물","folderName":"선물"}]',
  '[{"rowNumber":5,"productName":"","reason":"EMPTY_PRODUCT_NAME"}]',
  '[{"rowNumber":6,"productName":"신규 상품 중복","url":"https://shop.test/new"}]'
)::text, true);

select set_config('test.result', public.import_csv('10000000-0000-0000-0000-000000000001', current_setting('test.plan')::jsonb)::text, true);
select is(current_setting('test.result')::jsonb->>'importedCount', '1', '서버에서 실제 새로 저장한 상품만 성공으로 센다');
select is((select count(*) from public.products), 2::bigint, '기존 상품은 중복 생성하지 않는다');
select is((select count(*) from public.folders where kind='custom'), 2::bigint, '동일 원본은 기존 폴더를 재사용한다');
select is((select count(*) from public.product_folders pf join public.products p on p.id=pf.product_id where p.url='https://shop.test/new'), 2::bigint, '신규 상품에 여러 폴더 관계가 저장된다');
select is((select row(name,brand,price,image_url,saved_at)::text from public.products where url='https://shop.test/existing'),
  row('기존 상품','기존 브랜드',1200,'https://image.test/a',current_setting('test.existing_saved_at')::timestamptz)::text, '기존 상품 정보와 등록일을 덮어쓰지 않는다');
select ok((select wish_level is null from public.products where url='https://shop.test/existing'), '기존 상품에 소장 관계를 추가하면 위시레벨을 비운다');
select is((select count(*) from public.product_folders pf join public.folders f on f.id=pf.folder_id where f.kind='owned'), 1::bigint, '소장 Y를 소장 폴더에 연결한다');
select is((select price from public.products where url='https://shop.test/new'), 0, '직접 입력한 0원을 유지한다');
select is((select saved_at from public.products where url='https://shop.test/new'), '2026-10-12T00:00:00Z'::timestamptz, 'CSV 원래 등록일을 저장한다');
select is((select row(total_count,success_count,failed_count,duplicate_count,status)::text from public.import_jobs), row(5,1,2,2,'completed')::text, '실제 처리 결과와 완료 상태를 기록한다');
select is((select count(*) from public.import_failures), 2::bigint, '파싱 실패와 서버 입력 검증 실패를 기록한다');
select is(public.import_csv('10000000-0000-0000-0000-000000000001', current_setting('test.plan')::jsonb), current_setting('test.result')::jsonb, '같은 요청 재시도는 최초 결과를 그대로 반환한다');
select is((select count(*) from public.import_jobs), 1::bigint, '재시도로 작업 기록을 늘리지 않는다');
select is((select count(*) from public.product_folders), 4::bigint, '재시도로 관계를 늘리지 않는다');
select throws_ok($$insert into public.import_jobs(user_id,request_id,total_count) values(auth.uid(),gen_random_uuid(),0)$$, '42501', null, '앱은 작업 완료 기록을 직접 위조할 수 없다');
select throws_ok($$select public.import_csv(gen_random_uuid(), jsonb_build_object('userId',auth.uid(),'products',null))$$, '22023', 'invalid_import_plan', '잘못된 payload는 저장하지 않는다');
select throws_ok($$select public.import_csv(gen_random_uuid(), pg_temp.csv_plan('[]') || '{"userId":"00000000-0000-0000-0000-00000000000b"}')$$, '42501', 'account_changed', '파일 선택 뒤 계정이 바뀌면 다른 계정에 저장하지 않는다');
select throws_ok($$select public.import_csv(gen_random_uuid(), pg_temp.csv_plan('[]','[{"sourceName":"긴원본","folderName":"12345678"}]'))$$, '22023', 'invalid_folder_mapping', '서버가 폴더 이름 7자를 검사한다');
select throws_ok($$select public.import_csv(gen_random_uuid(), pg_temp.csv_plan('[]','[{"sourceName":"긴원본","folderName":"신발"}]'))$$, '40001', 'csv_folder_conflict', '조회 뒤 생긴 후보 이름 충돌은 재계산을 요청한다');
select is((select count(*) from public.import_jobs), 1::bigint, '취소된 요청은 미완료 작업을 남기지 않는다');

-- 같은 Import에서 앞 버킷이 만든 이름과 뒤 원본 버킷 이름이 겹쳐도 별개로 저장한다.
select lives_ok($$select public.import_csv('10000000-0000-0000-0000-000000000002', pg_temp.csv_plan(
  '[{"rowNumber":2,"name":"충돌 상품","url":"https://shop.test/collision","savedAt":"2026-10-12T00:00:00Z","price":"999999999999999999999","isOwned":false,"sourceFolderNames":["abcdefg-long","abcdefg"]}]',
  '[{"sourceName":"abcdefg-long","folderName":"abcdefg"},{"sourceName":"abcdefg","folderName":"abcdef2"}]'))$$, '같은 파일의 잘린 이름 충돌을 구분한다');
select is((select count(*) from public.product_folders pf join public.products p on p.id=pf.product_id where p.url='https://shop.test/collision'), 2::bigint, '다른 원본 버킷에 각각 연결한다');
select ok((select price is null from public.products where url='https://shop.test/collision'), '정수 범위를 넘는 가격만 비우고 상품은 저장한다');

select is((select csv_source_name from public.folders where name='abcdefg'), 'abcdefg-long', '잘린 폴더에 CSV 원본 버킷명을 보존한다');
select is((select csv_source_name from public.folders where name='abcdef2'), 'abcdefg', '이름이 충돌한 서로 다른 원본을 각각 보존한다');
select throws_ok($$update public.folders set csv_source_name='위조' where name='abcdefg'$$, '42501', null, '앱은 보존한 원본 버킷명을 바꿀 수 없다');
select throws_ok($$insert into public.folders(name,csv_source_name) values('직접생성','위조')$$, '42501', null, '앱의 직접 생성으로 원본 버킷을 선점할 수 없다');

select set_config('test.folder_count', (select count(*)::text from public.folders), true);
select set_config('test.repeat_result', public.import_csv(gen_random_uuid(), pg_temp.csv_plan(
  '[{"rowNumber":2,"name":"충돌 상품","url":"https://shop.test/collision","savedAt":"2026-10-12T00:00:00Z","isOwned":false,"sourceFolderNames":["abcdefg-long","abcdefg"]}]',
  '[{"sourceName":"abcdefg-long","folderName":"abcdefg"},{"sourceName":"abcdefg","folderName":"abcdef2"}]'))::text, true);
select is((select count(*)::text from public.folders), current_setting('test.folder_count'), '새 요청으로 재업로드해도 같은 원본의 폴더를 늘리지 않는다');
select is(current_setting('test.repeat_result')::jsonb->>'importedCount', '0', '재업로드 상품은 중복으로 제외한다');
select is(jsonb_array_length(current_setting('test.repeat_result')::jsonb->'folderFailures'), 0, '이미 폴더에 있는 중복 상품에 잘못된 경고를 만들지 않는다');

update public.folders set name='바꾼이름' where csv_source_name='abcdefg-long';
select lives_ok($$select public.import_csv(gen_random_uuid(), pg_temp.csv_plan(
  '[{"rowNumber":2,"name":"이름 변경 후","url":"https://shop.test/renamed","savedAt":"2026-10-12T00:00:00Z","isOwned":false,"sourceFolderNames":["abcdefg-long"]}]',
  '[{"sourceName":"abcdefg-long","folderName":"바꾼이름"}]'))$$, '표시 이름을 바꿔도 원본 버킷으로 폴더를 재사용한다');
select is((select count(*)::text from public.folders), current_setting('test.folder_count'), '이름 변경 뒤에도 새 폴더를 만들지 않는다');
select throws_ok($$select public.import_csv(gen_random_uuid(), pg_temp.csv_plan('[]',
  '[{"sourceName":"abcdefg-long","folderName":"abcdefg"}]'))$$, '40001', 'csv_folder_conflict', '조회 뒤 폴더 이름이 바뀌면 최신 매핑을 요청한다');
delete from public.folders where csv_source_name='abcdefg-long';
select lives_ok($$select public.import_csv(gen_random_uuid(), pg_temp.csv_plan(
  '[{"rowNumber":2,"name":"삭제 후","url":"https://shop.test/renamed","savedAt":"2026-10-12T00:00:00Z","isOwned":false,"sourceFolderNames":["abcdefg-long"]}]',
  '[{"sourceName":"abcdefg-long","folderName":"abcdefg"}]'))$$, '폴더를 삭제한 뒤 재업로드하면 다시 만들 수 있다');
select is((select f.name from public.product_folders pf join public.folders f on f.id=pf.folder_id join public.products p on p.id=pf.product_id where p.url='https://shop.test/renamed'), 'abcdefg', '재생성한 폴더에 기존 상품을 다시 연결한다');

select set_config('test.future_result', public.import_csv(gen_random_uuid(), pg_temp.csv_plan(
  jsonb_build_array(jsonb_build_object('rowNumber',2,'name','미래 상품','url','https://shop.test/future',
    'savedAt',now()+interval '1 day','isOwned',false,'sourceFolderNames','[]'::jsonb))))::text, true);
select is(current_setting('test.future_result')::jsonb->>'importedCount', '0', 'RPC를 직접 호출해도 미래 등록일 상품은 저장하지 않는다');
select is(current_setting('test.future_result')::jsonb->'excludedProducts'->0->>'reason', 'INVALID_PRODUCT_DATA', '미래 등록일을 상품 검증 실패로 기록한다');
select is((select count(*) from public.products where url='https://shop.test/future'), 0::bigint, '미래 등록일로 ALL 상단에 고정할 수 없다');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*) from public.folders where csv_source_name is not null), 0::bigint, '다른 사용자의 원본 버킷명은 보이지 않는다');
select is((select count(*) from public.import_jobs), 0::bigint, '다른 사용자의 작업 기록은 보이지 않는다');
select is((select count(*) from public.import_failures), 0::bigint, '다른 사용자의 실패 기록은 보이지 않는다');
select lives_ok($$select public.import_csv('10000000-0000-0000-0000-000000000001', pg_temp.csv_plan('[]'))$$, '요청 ID가 같아도 다른 계정 결과를 반환하지 않는다');
select is((select count(*) from public.products), 0::bigint, '다른 계정 상품은 접근하지 않는다');

reset role;
insert into public.folders(user_id,name) select '00000000-0000-0000-0000-00000000000c', '폴더'||i from generate_series(0,48) i;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select set_config('test.limit_plan', pg_temp.csv_plan(
  '[{"rowNumber":2,"name":"한도 상품","url":"https://shop.test/limit","savedAt":"2026-10-12T00:00:00Z","isOwned":true,"sourceFolderNames":["폴더0","마지막","초과"]}]',
  '[{"sourceName":"마지막","folderName":"마지막"},{"sourceName":"초과","folderName":"초과"},{"sourceName":"폴더0","folderName":"폴더0"}]'
)::text, true);
select set_config('test.limit_result', public.import_csv('30000000-0000-0000-0000-000000000001', current_setting('test.limit_plan')::jsonb)::text, true);
select is((select count(*) from public.folders where kind='custom'), 50::bigint, '49개에서는 하나를 만들고 50개에서 막는다');
select is((select count(*) from public.folders), 51::bigint, '소장 폴더는 50개 제한에서 제외한다');
select is(current_setting('test.limit_result')::jsonb->>'importedCount', '1', '폴더 한도 초과에도 상품은 ALL에 저장한다');
select is(jsonb_array_length(current_setting('test.limit_result')::jsonb->'folderFailures'), 1, '한도 초과 관계만 별도 경고한다');
select is((select count(*) from public.product_folders), 3::bigint, '기존 폴더·생성 성공 폴더·소장 관계를 유지한다');
select is((select failed_count from public.import_jobs), 0, '폴더 한도 경고는 상품 실패 수에 포함하지 않는다');
select throws_ok($$insert into public.folders(name) values('차단')$$, 'P0001', 'folder_limit_reached', '직접 만드는 폴더도 같은 한도로 막는다');

select set_config('test.full_repeat', public.import_csv(gen_random_uuid(), pg_temp.csv_plan(
  '[{"rowNumber":2,"name":"한도 상품","url":"https://shop.test/limit","savedAt":"2026-10-12T00:00:00Z","isOwned":false,"sourceFolderNames":["마지막"]}]',
  '[{"sourceName":"마지막","folderName":"마지막"}]'))::text, true);
select is(jsonb_array_length(current_setting('test.full_repeat')::jsonb->'folderFailures'), 0, '폴더 50개에서도 저장된 원본 버킷은 경고 없이 재사용한다');
delete from public.folders where name='폴더48';
select lives_ok($$insert into public.folders(name) values('삭제후생성')$$, '폴더를 하나 삭제하면 다시 만들 수 있다');

select finish();
rollback;
