begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(17);

select has_column('public', 'profiles', 'signup_completed_at', 'Signup completion is stored per account');
select ok(not has_function_privilege('anon', 'public.claim_signup_completion()', 'EXECUTE'), 'Guests cannot claim onboarding');
select ok(has_function_privilege('authenticated', 'public.claim_signup_completion()', 'EXECUTE'), 'Members can claim their onboarding');

insert into auth.users (id, email) values
  ('24900000-0000-0000-0000-000000000001', 'signup-new@test.dev'),
  ('24900000-0000-0000-0000-000000000002', 'signup-existing@test.dev');
insert into auth.sessions (id, user_id) values
  ('24900000-0000-0000-0001-000000000001', '24900000-0000-0000-0000-000000000001'),
  ('24900000-0000-0000-0001-000000000002', '24900000-0000-0000-0000-000000000001'),
  ('24900000-0000-0000-0001-000000000003', '24900000-0000-0000-0000-000000000002');
update public.profiles set signup_completed_at = now() - interval '1 day'
where id = '24900000-0000-0000-0000-000000000002';

set local role anon;
select throws_ok($$ select public.claim_signup_completion() $$, '42501', null, 'Guest call denied');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$ select public.claim_signup_completion() $$, '42501', 'not_authenticated', 'Missing user denied');
set local request.jwt.claims = '{"sub":"24900000-0000-0000-0000-000000000001","role":"authenticated","session_id":"24900000-0000-0000-0001-000000000001"}';
select is(public.claim_signup_completion(), true, 'New signup claims onboarding once');
select ok((select signup_completed_at is not null from public.profiles where id = auth.uid()), 'Claim persists on the account');
select is(public.claim_signup_completion(), false, 'Repeated login does not claim again');
select throws_ok($$ update public.profiles set signup_completed_at = null where id = auth.uid() $$,
  '42501', null, 'Member cannot clear the marker');

set local request.jwt.claims = '{"sub":"24900000-0000-0000-0000-000000000001","role":"authenticated","session_id":"24900000-0000-0000-0001-000000000002"}';
select is(public.claim_signup_completion(), false, 'Another device does not claim again');
set local request.jwt.claims = '{"sub":"24900000-0000-0000-0000-000000000002","role":"authenticated","session_id":"24900000-0000-0000-0001-000000000003"}';
select is(public.claim_signup_completion(), false, 'Backfilled existing member skips signup screen');
select is((select count(*) from public.profiles where id = '24900000-0000-0000-0000-000000000001'), 0::bigint, 'Another account marker is not readable');
reset role;

update public.profiles set status = 'suspended', suspended_at = now()
where id = '24900000-0000-0000-0000-000000000002';
set local role authenticated;
select throws_ok($$ select public.claim_signup_completion() $$, '42501', 'suspended', 'Suspended member denied');
reset role;
delete from auth.sessions where id = '24900000-0000-0000-0001-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"24900000-0000-0000-0000-000000000001","role":"authenticated","session_id":"24900000-0000-0000-0001-000000000002"}';
select throws_ok($$ select public.claim_signup_completion() $$, '42501', 'not_authorized', 'Revoked session denied');
reset role;

delete from auth.users where id = '24900000-0000-0000-0000-000000000001';
insert into auth.users (id, email) values ('24900000-0000-0000-0000-000000000003', 'signup-new@test.dev');
insert into auth.sessions (id, user_id) values
  ('24900000-0000-0000-0001-000000000004', '24900000-0000-0000-0000-000000000003');
select ok((select signup_completed_at is null from public.profiles where id = '24900000-0000-0000-0000-000000000003'), 'Rejoined account starts with no marker');
set local role authenticated;
set local request.jwt.claims = '{"sub":"24900000-0000-0000-0000-000000000003","role":"authenticated","session_id":"24900000-0000-0000-0001-000000000004"}';
select is(public.claim_signup_completion(), true, 'Rejoined account can see signup completion');
select is(public.claim_signup_completion(), false, 'Rejoined account also sees it only once');
reset role;
select * from finish();
rollback;
