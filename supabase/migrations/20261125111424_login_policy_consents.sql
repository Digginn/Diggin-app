SET local check_function_bodies = off;

ALTER TABLE "public"."profiles"
  ADD COLUMN "age_confirmed_at" timestamp WITH time zone;

CREATE OR REPLACE FUNCTION private.complete_login_consent (
  terms_policy_id   bigint,
  privacy_policy_id bigint,
  age_confirmed     boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer uuid := (select auth.uid());
  current_state jsonb;
begin
  perform private.assert_account_access();
  perform 1 from public.profiles where id = viewer for update;
  current_state := private.login_policy_status(viewer);
  if terms_policy_id is distinct from (current_state->>'terms_policy_id')::bigint
    or privacy_policy_id is distinct from (current_state->>'privacy_policy_id')::bigint then
    raise exception 'login_policies_changed' using errcode = '22023';
  end if;
  if age_confirmed is true then
    insert into private.user_policy_consents(user_id, policy_id)
      values (viewer, terms_policy_id), (viewer, privacy_policy_id) on conflict do nothing;
    update public.profiles set age_confirmed_at = coalesce(age_confirmed_at, now()) where id = viewer;
  elsif (current_state->>'requires_consent')::boolean then
    raise exception 'login_consent_required' using errcode = '42501';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.login_policy_status (
  target_user uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  terms public.legal_policies%rowtype;
  privacy public.legal_policies%rowtype;
  needs_consent boolean;
begin
  select * into terms from public.legal_policies
    where kind = 'terms' and effective_at <= now() order by effective_at desc, id desc limit 1;
  select * into privacy from public.legal_policies
    where kind = 'privacy' and effective_at <= now() order by effective_at desc, id desc limit 1;
  if terms.id is null or privacy.id is null then
    raise exception 'login_policies_not_configured' using errcode = 'P0001';
  end if;
  needs_consent := target_user is null
    or not exists (select 1 from public.profiles where id = target_user and age_confirmed_at is not null)
    or exists (
      select 1 from public.legal_policies latest where latest.id in (terms.id, privacy.id)
        and not exists (
          select 1 from private.user_policy_consents c
          join public.legal_policies agreed on agreed.id = c.policy_id
          where c.user_id = target_user and agreed.kind = latest.kind
            and (agreed.id = latest.id or (not latest.requires_reconsent and agreed.effective_at <= latest.effective_at))
        )
    );
  return jsonb_build_object('requires_consent', needs_consent, 'is_new_user', target_user is null,
    'terms_policy_id', terms.id, 'terms_version', terms.version,
    'privacy_policy_id', privacy.id, 'privacy_version', privacy.version);
end;
$function$;

CREATE OR REPLACE FUNCTION private.lookup_login_policy_status (
  identity_provider text,
  identity_subject  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare target_user uuid;
begin
  if identity_provider is null or identity_provider not in ('google', 'kakao', 'apple')
    or identity_subject is null or length(identity_subject) not between 1 and 1024 then
    raise exception 'invalid_identity' using errcode = '22023';
  end if;
  select user_id into target_user from auth.identities
    where provider = identity_provider and provider_id = identity_subject;
  return private.login_policy_status(target_user);
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_login_consent (
  terms_policy_id   bigint,
  privacy_policy_id bigint,
  age_confirmed     boolean
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.complete_login_consent(terms_policy_id, privacy_policy_id, age_confirmed); $function$;

REVOKE ALL ON FUNCTION "public"."complete_login_consent"(bigint, bigint, boolean) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.lookup_login_policy_status (
  identity_provider text,
  identity_subject  text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.lookup_login_policy_status(identity_provider, identity_subject); $function$;

REVOKE ALL ON FUNCTION "public"."lookup_login_policy_status"(text, text) FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "private"."complete_login_consent"(bigint, bigint, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."complete_login_consent"(bigint, bigint, boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."login_policy_status"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."lookup_login_policy_status"(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."lookup_login_policy_status"(text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."complete_login_consent"(bigint, bigint, boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."complete_login_consent"(bigint, bigint, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."complete_login_consent"(bigint, bigint, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."complete_login_consent"(bigint, bigint, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."lookup_login_policy_status"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."lookup_login_policy_status"(text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."lookup_login_policy_status"(text, text) TO "service_role";

-- Current in-app policy text: immutable repository revision. No historical consent is fabricated.
insert into public.legal_policies(kind,version,effective_at,document_url,requires_reconsent)
values
 ('terms','1.1','2026-11-25T00:00:00+09:00','https://github.com/Digginn/Diggin-app/blob/19a351a01a2cdd4263e42faef7edaeb053bbd209/src/constants/policyDocuments.json',true),
 ('privacy','1.1','2026-11-25T00:00:00+09:00','https://github.com/Digginn/Diggin-app/blob/19a351a01a2cdd4263e42faef7edaeb053bbd209/src/constants/policyDocuments.json',true)
on conflict(kind,version) do nothing;
