SET local check_function_bodies = off;

ALTER TABLE "public"."profiles"
  ADD COLUMN "signup_completed_at" timestamp WITH time zone;

CREATE OR REPLACE FUNCTION private.claim_signup_completion()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := (select auth.uid());
  claimed boolean := false;
begin
  perform private.assert_account_access();
  update public.profiles
  set signup_completed_at = now()
  where id = viewer_id and signup_completed_at is null
  returning true into claimed;
  return coalesce(claimed, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_signup_completion()
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.claim_signup_completion();
$function$;

REVOKE ALL ON FUNCTION "public"."claim_signup_completion"() FROM PUBLIC, "anon";

REVOKE ALL ON FUNCTION "private"."claim_signup_completion"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."claim_signup_completion"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."claim_signup_completion"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."claim_signup_completion"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_signup_completion"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_signup_completion"() TO "service_role";

-- Existing accounts must not see the signup completion screen after rollout.
update public.profiles set signup_completed_at = now() where signup_completed_at is null;
