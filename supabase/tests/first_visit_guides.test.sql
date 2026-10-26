begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(27);

select ok(not has_table_privilege('anon', 'private.first_visit_guides', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'Guests have no table privileges');
select ok(not has_table_privilege('authenticated', 'private.first_visit_guides', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'Members have no table privileges');
select ok(not has_sequence_privilege('anon', 'private.first_visit_guides_id_seq', 'USAGE, SELECT, UPDATE'), 'Guests have no sequence privileges');
select ok(not has_sequence_privilege('authenticated', 'private.first_visit_guides_id_seq', 'USAGE, SELECT, UPDATE'), 'Members have no sequence privileges');

insert into auth.users (id, email) values
  ('15200000-0000-0000-0000-000000000001', 'guide-a@test.dev'),
  ('15200000-0000-0000-0000-000000000002', 'guide-b@test.dev');
insert into auth.sessions (id, user_id) values
  ('15200000-0000-0000-0001-000000000001', '15200000-0000-0000-0000-000000000001');

set local role anon;
select throws_ok($$ select public.get_first_visit_guides('15200000-0000-0000-0000-000000000001') $$,
  '42501', null, 'Guests cannot read guide records');
select throws_ok($$ select public.dismiss_first_visit_guide('15200000-0000-0000-0000-000000000001', 'all') $$,
  '42501', null, 'Guests cannot dismiss guides');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"15200000-0000-0000-0000-000000000001","role":"authenticated","session_id":"15200000-0000-0000-0001-000000000001"}';
select is(public.get_first_visit_guides('15200000-0000-0000-0000-000000000001'), array[]::text[], 'New account has no dismissed guides');
select lives_ok($$ select public.dismiss_first_visit_guide('15200000-0000-0000-0000-000000000001', 'all') $$, 'Dismiss ALL');
select is(public.get_first_visit_guides('15200000-0000-0000-0000-000000000001'), array['all'], 'Dismissing ALL leaves other guides unseen');
select lives_ok($$ select public.dismiss_first_visit_guide('15200000-0000-0000-0000-000000000001', 'folder') $$, 'Dismiss FOLDER');
select lives_ok($$ select public.dismiss_first_visit_guide('15200000-0000-0000-0000-000000000001', 'item-detail') $$, 'Dismiss detail');
select is(public.get_first_visit_guides('15200000-0000-0000-0000-000000000001'), array['all', 'folder', 'item-detail'], 'Account reads all three records regardless of device');
select lives_ok($$ select public.dismiss_first_visit_guide('15200000-0000-0000-0000-000000000001', 'all') $$, 'Duplicate dismissal is idempotent');
select throws_ok($$ select public.get_first_visit_guides('15200000-0000-0000-0000-000000000002') $$, '42501', 'not_authorized', 'Cannot read another account');
select throws_ok($$ select public.dismiss_first_visit_guide('15200000-0000-0000-0000-000000000002', 'all') $$, '42501', 'not_authorized', 'Cannot dismiss for another account');
select throws_ok($$ select public.dismiss_first_visit_guide('15200000-0000-0000-0000-000000000001', 'unknown') $$, '22023', 'invalid_guide_kind', 'Unknown guide rejected');
select throws_ok($$ select public.dismiss_first_visit_guide('15200000-0000-0000-0000-000000000001', null) $$, '22023', 'invalid_guide_kind', 'Null guide rejected');
select throws_ok($$ select * from private.first_visit_guides $$, '42501', null, 'Direct table read denied');
select throws_ok($$ insert into private.first_visit_guides (user_id, guide_kind) values ('15200000-0000-0000-0000-000000000001', 'all') $$, '42501', null, 'Direct table write denied');
reset role;

select is((select count(*) from private.first_visit_guides where user_id = '15200000-0000-0000-0000-000000000001'), 3::bigint, 'Duplicate dismissal did not create another row');
update public.profiles set status = 'suspended', suspended_at = now() where id = '15200000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$ select public.get_first_visit_guides('15200000-0000-0000-0000-000000000001') $$, '42501', 'suspended', 'Suspended account cannot read');
select throws_ok($$ select public.dismiss_first_visit_guide('15200000-0000-0000-0000-000000000001', 'all') $$, '42501', 'suspended', 'Suspended account cannot write');
reset role;
update public.profiles set status = 'active', suspended_at = null where id = '15200000-0000-0000-0000-000000000001';
delete from auth.sessions where id = '15200000-0000-0000-0001-000000000001';
set local role authenticated;
select throws_ok($$ select public.get_first_visit_guides('15200000-0000-0000-0000-000000000001') $$, '42501', 'not_authorized', 'Revoked session cannot read');
select throws_ok($$ select public.dismiss_first_visit_guide('15200000-0000-0000-0000-000000000001', 'all') $$, '42501', 'not_authorized', 'Revoked session cannot write');
set local request.jwt.claims = '{"sub":"15200000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.get_first_visit_guides('15200000-0000-0000-0000-000000000002'), array[]::text[], 'Other account remains unseen');
reset role;

delete from auth.users where id = '15200000-0000-0000-0000-000000000001';
select is((select count(*) from private.first_visit_guides), 0::bigint, 'Withdrawal cascades guide records');
insert into auth.users (id, email) values ('15200000-0000-0000-0000-000000000003', 'guide-a@test.dev');
set local role authenticated;
set local request.jwt.claims = '{"sub":"15200000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(public.get_first_visit_guides('15200000-0000-0000-0000-000000000003'), array[]::text[], 'Rejoined account starts unseen');

select * from finish();
rollback;
