SET local check_function_bodies = off;

ALTER TABLE "private"."withdrawal_surveys"
  DROP CONSTRAINT "withdrawal_surveys_custom_text_length";

ALTER TABLE "private"."withdrawal_surveys"
  DROP CONSTRAINT "withdrawal_surveys_has_reason";

CREATE OR REPLACE FUNCTION private.clear_withdrawn_comments()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update private.comments set content = null where author_id = old.id;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION private.record_withdrawal_survey (
  reasons     public.withdrawal_reason[],
  custom_text text
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  insert into private.withdrawal_surveys (reasons, custom_text)
  values (coalesce(reasons, '{}'), nullif(btrim(custom_text), ''));
$function$;

CREATE OR REPLACE FUNCTION public.record_withdrawal_survey (
  reasons     public.withdrawal_reason[],
  custom_text text
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.record_withdrawal_survey(reasons, custom_text);
$function$;

REVOKE ALL ON FUNCTION "public"."record_withdrawal_survey"(public.withdrawal_reason[], text) FROM PUBLIC, "anon", "authenticated";

ALTER TABLE "private"."withdrawal_surveys"
  ADD CONSTRAINT "withdrawal_surveys_has_reason" CHECK (((cardinality(reasons) > 0) OR (COALESCE(length(btrim(custom_text)), 0) > 0)));

CREATE TRIGGER profiles_clear_withdrawn_comments
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.clear_withdrawn_comments();

REVOKE ALL ON FUNCTION "private"."clear_withdrawn_comments"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."record_withdrawal_survey"(public.withdrawal_reason[], text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."record_withdrawal_survey"(public.withdrawal_reason[], text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_withdrawal_survey"(public.withdrawal_reason[], text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_withdrawal_survey"(public.withdrawal_reason[], text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_withdrawal_survey"(public.withdrawal_reason[], text) TO "service_role";

ALTER TABLE "private"."withdrawal_surveys"
  ADD CONSTRAINT "withdrawal_surveys_custom_text_length" CHECK ((private.char_count(custom_text) <= 100));
