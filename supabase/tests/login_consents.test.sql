begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select ok(not has_function_privilege('anon','public.lookup_login_policy_status(text,text)','EXECUTE'), 'Guest cannot look up identity consents');
select ok(not has_function_privilege('authenticated','public.lookup_login_policy_status(text,text)','EXECUTE'), 'Member cannot look up another identity');
select ok(has_function_privilege('service_role','public.lookup_login_policy_status(text,text)','EXECUTE'), 'Verified Edge can look up consent');
select ok(not has_function_privilege('anon','public.complete_login_consent(bigint,bigint,boolean)','EXECUTE'), 'Guest cannot record consent');
select ok(has_function_privilege('authenticated','public.complete_login_consent(bigint,bigint,boolean)','EXECUTE'), 'Member can record own consent');
select set_config('test.terms',(select id::text from public.legal_policies where kind='terms' and version='1.1'),true);
select set_config('test.privacy',(select id::text from public.legal_policies where kind='privacy' and version='1.1'),true);
insert into auth.users(id,email) values
 ('24910000-0000-0000-0000-000000000001','consent-a@test.dev'),
 ('24910000-0000-0000-0000-000000000002','consent-b@test.dev');
insert into auth.identities(id,user_id,provider_id,provider,identity_data) values
 ('24910000-0000-0000-0002-000000000001','24910000-0000-0000-0000-000000000001','consent-sub','google','{"sub":"consent-sub"}');
insert into auth.sessions(id,user_id) values
 ('24910000-0000-0000-0001-000000000001','24910000-0000-0000-0000-000000000001');

set local role service_role;
select throws_ok($$select public.lookup_login_policy_status('other','subject')$$,'22023','invalid_identity','Unknown provider rejected');
select throws_ok($$select public.lookup_login_policy_status('google',null)$$,'22023','invalid_identity','Missing subject rejected');
select is((public.lookup_login_policy_status('google','new-sub')->>'requires_consent')::boolean,true,'New identity requires consent');
select is((public.lookup_login_policy_status('google','new-sub')->>'is_new_user')::boolean,true,'Unregistered identity is new');
select is((public.lookup_login_policy_status('google','consent-sub')->>'requires_consent')::boolean,true,'Existing account with no proof requires consent once');
select is((public.lookup_login_policy_status('google','consent-sub')->>'is_new_user')::boolean,false,'Missing consent does not make an existing identity a new signup');
reset role;
select is((select count(*) from auth.identities where provider_id='new-sub'),0::bigint,'Checking a new identity never creates an account');
set local role anon;
select throws_ok($$select public.lookup_login_policy_status('google','consent-sub')$$,'42501',null,'Guest call denied');
set local role authenticated;
set local request.jwt.claims='{"sub":"24910000-0000-0000-0000-000000000001","role":"authenticated","session_id":"24910000-0000-0000-0001-000000000001"}';
select throws_ok($$select public.lookup_login_policy_status('google','consent-sub')$$,'42501',null,'Member identity lookup denied');
select throws_ok($$select public.complete_login_consent(current_setting('test.terms')::bigint,current_setting('test.privacy')::bigint,false)$$,'42501','login_consent_required','Required consent cannot be skipped');
select throws_ok($$select public.complete_login_consent(0,current_setting('test.privacy')::bigint,true)$$,'22023','login_policies_changed','Wrong policy version rejected');
select lives_ok($$select public.complete_login_consent(current_setting('test.terms')::bigint,current_setting('test.privacy')::bigint,true)$$,'Explicit required consent saved');
select ok((select age_confirmed_at is not null from public.profiles where id=auth.uid()),'Age declaration is recorded');
select lives_ok($$select public.complete_login_consent(current_setting('test.terms')::bigint,current_setting('test.privacy')::bigint,false)$$,'Subsequent login does not ask for consent');
reset role;
select is((select count(*) from private.user_policy_consents where user_id='24910000-0000-0000-0000-000000000001'),2::bigint,'Both policies saved once');
select is((select count(*) from private.user_policy_consents where user_id='24910000-0000-0000-0000-000000000002'),0::bigint,'Another account has no fabricated consent');
set local role service_role;
select is((public.lookup_login_policy_status('google','consent-sub')->>'requires_consent')::boolean,false,'New device sees server consent');
reset role;

insert into public.legal_policies(kind,version,effective_at,document_url,requires_reconsent)
 values('terms','test-2',now()+interval '1 day','https://example.test/terms/2',true);
select is((private.login_policy_status('24910000-0000-0000-0000-000000000001')->>'requires_consent')::boolean,false,'Future policy not required yet');
update public.legal_policies set effective_at=now() where kind='terms' and version='test-2';
select is((private.login_policy_status('24910000-0000-0000-0000-000000000001')->>'requires_consent')::boolean,true,'Effective reconsent version requires the sheet');
set local role authenticated;
select throws_ok($$select public.complete_login_consent(current_setting('test.terms')::bigint,current_setting('test.privacy')::bigint,true)$$,'22023','login_policies_changed','Old open sheet cannot consent to a new version');
reset role;
select set_config('test.terms',(select id::text from public.legal_policies where kind='terms' and version='test-2'),true);
set local role authenticated;
select lives_ok($$select public.complete_login_consent(current_setting('test.terms')::bigint,current_setting('test.privacy')::bigint,true)$$,'Reconsent to the displayed current version');
reset role;
select is((private.login_policy_status('24910000-0000-0000-0000-000000000001')->>'requires_consent')::boolean,false,'Reconsent sheet is not repeated');
insert into public.legal_policies(kind,version,effective_at,document_url,requires_reconsent)
 values('privacy','test-2',now(),'https://example.test/privacy/2',false);
select is((private.login_policy_status('24910000-0000-0000-0000-000000000001')->>'requires_consent')::boolean,false,'Non-reconsent update keeps previous valid consent');
update public.profiles set status='suspended',suspended_at=now() where id='24910000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select public.complete_login_consent(current_setting('test.terms')::bigint,current_setting('test.privacy')::bigint,true)$$,'42501','suspended','Suspended account cannot record consent');
reset role;
update public.profiles set status='active',suspended_at=null where id='24910000-0000-0000-0000-000000000001';
delete from auth.sessions where id='24910000-0000-0000-0001-000000000001';
set local role authenticated;
select throws_ok($$select public.complete_login_consent(current_setting('test.terms')::bigint,current_setting('test.privacy')::bigint,true)$$,'42501','not_authorized','Revoked session rejected');
reset role;
select * from finish();
rollback;
