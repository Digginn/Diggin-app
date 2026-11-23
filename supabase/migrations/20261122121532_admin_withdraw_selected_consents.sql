SET local check_function_bodies = off;

DROP FUNCTION "private"."admin_withdraw_analytics_consent"(uuid, uuid, text);

DROP FUNCTION "public"."admin_withdraw_analytics_consent"(uuid, uuid, text);

CREATE OR REPLACE FUNCTION private.admin_withdraw_analytics_consent (
  actor                      uuid,
  actor_session              uuid,
  target_email               text,
  withdraw_usage_analysis    boolean DEFAULT true,
  withdraw_overseas_transfer boolean DEFAULT true
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  matches uuid[];
  previous jsonb;
  state jsonb;
begin
  perform private.assert_moderator(actor, actor_session);
  if target_email is null or btrim(target_email) !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if not coalesce(withdraw_usage_analysis or withdraw_overseas_transfer, false) then
    raise exception 'invalid_analytics_consent' using errcode = '22023';
  end if;
  select array_agg(account.id) into matches
  from auth.users as account
  join public.profiles as profile on profile.id = account.id
  where lower(account.email) = lower(btrim(target_email));
  if matches is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if cardinality(matches) > 1 then
    raise exception 'user_email_conflict' using errcode = 'P0001';
  end if;
  -- 고르지 않은 항목은 현재 상태를 유지한다. 읽기 전에 잠가야 앱에서 동시에 철회한 값을 덮어쓰지 않는다.
  perform 1 from public.profiles where id = matches[1] for update;
  previous := private.analytics_consent_state(matches[1]);
  state := private.record_analytics_consent(
    matches[1],
    (previous ->> 'usage_analysis')::boolean and not coalesce(withdraw_usage_analysis, false),
    (previous ->> 'overseas_transfer')::boolean and not coalesce(withdraw_overseas_transfer, false),
    'operator', actor
  );
  -- 한 항목만 철회해도 수집이 멈춘다. 동의 이력이 없는 이전 빌드 수집분도 지워야 해 항상 삭제를 요청한다.
  perform private.enqueue_amplitude_deletion(matches[1], 'consent_withdrawn');
  return jsonb_build_object('user_id', matches[1]) || state;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_withdraw_analytics_consent (
  actor                      uuid,
  actor_session              uuid,
  target_email               text,
  withdraw_usage_analysis    boolean DEFAULT true,
  withdraw_overseas_transfer boolean DEFAULT true
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.admin_withdraw_analytics_consent(
    actor, actor_session, target_email, withdraw_usage_analysis, withdraw_overseas_transfer
  );
$function$;

REVOKE ALL ON FUNCTION "public"."admin_withdraw_analytics_consent"(uuid, uuid, text, boolean, boolean) FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "private"."admin_withdraw_analytics_consent"(uuid, uuid, text, boolean, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."admin_withdraw_analytics_consent"(uuid, uuid, text, boolean, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."admin_withdraw_analytics_consent"(uuid, uuid, text, boolean, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_withdraw_analytics_consent"(uuid, uuid, text, boolean, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_withdraw_analytics_consent"(uuid, uuid, text, boolean, boolean) TO "service_role";
