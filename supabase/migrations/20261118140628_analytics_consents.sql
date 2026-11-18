SET local check_function_bodies = off;

CREATE TABLE "private"."amplitude_deletion_jobs" (
  "id"           bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "reason"       text                     NOT NULL,
  "attempts"     integer                  NOT NULL DEFAULT 0,
  "available_at" timestamp with time zone NOT NULL DEFAULT now(),
  "lease_id"     uuid,
  "leased_until" timestamp with time zone,
  "last_error"   text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  CONSTRAINT "amplitude_deletion_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "amplitude_deletion_jobs_reason_check" CHECK ((reason = ANY (ARRAY['consent_withdrawn'::text, 'account_deleted'::text])))
);

ALTER TABLE "private"."amplitude_deletion_jobs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."analytics_consent_logs" (
  "id"         bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "item"       text                     NOT NULL,
  "is_agreed"  boolean                  NOT NULL,
  "source"     text                     NOT NULL,
  "admin_id"   uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "analytics_consent_logs_check" CHECK (((source = 'operator'::text) = (admin_id IS NOT NULL))),
  CONSTRAINT "analytics_consent_logs_item_check" CHECK ((item = ANY (ARRAY['usage_analysis'::text, 'overseas_transfer'::text]))),
  CONSTRAINT "analytics_consent_logs_pkey" PRIMARY KEY (id),
  CONSTRAINT "analytics_consent_logs_source_check" CHECK ((source = ANY (ARRAY['signup'::text, 'login'::text, 'settings'::text, 'operator'::text])))
);

ALTER TABLE "private"."analytics_consent_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.admin_withdraw_analytics_consent (
  actor         uuid,
  actor_session uuid,
  target_email  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  matches uuid[];
  state jsonb;
begin
  perform private.assert_moderator(actor, actor_session);
  if target_email is null or btrim(target_email) !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
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
  state := private.record_analytics_consent(matches[1], false, false, 'operator', actor);
  return jsonb_build_object('user_id', matches[1]) || state;
end;
$function$;

CREATE OR REPLACE FUNCTION private.analytics_consent_state (
  target_user uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'usage_analysis', coalesce((
      select log.is_agreed from private.analytics_consent_logs as log
      where log.user_id = target_user and log.item = 'usage_analysis'
      order by log.created_at desc, log.id desc limit 1
    ), false),
    'overseas_transfer', coalesce((
      select log.is_agreed from private.analytics_consent_logs as log
      where log.user_id = target_user and log.item = 'overseas_transfer'
      order by log.created_at desc, log.id desc limit 1
    ), false)
  );
$function$;

CREATE OR REPLACE FUNCTION private.analytics_fully_agreed (
  state jsonb
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select (state ->> 'usage_analysis')::boolean and (state ->> 'overseas_transfer')::boolean;
$function$;

CREATE OR REPLACE FUNCTION private.claim_amplitude_deletions()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  claim_id uuid := gen_random_uuid();
  user_ids jsonb;
begin
  with candidates as (
    select job.id from private.amplitude_deletion_jobs as job
    where job.completed_at is null and job.available_at <= now()
      and (job.leased_until is null or job.leased_until <= now())
    order by job.available_at, job.id limit 100 for update skip locked
  ), claimed as (
    update private.amplitude_deletion_jobs as job
    set lease_id = claim_id, leased_until = now() + interval '5 minutes', attempts = job.attempts + 1
    from candidates where job.id = candidates.id
    returning job.user_id
  )
  select coalesce(jsonb_agg(claimed.user_id::text), '[]'::jsonb) into user_ids from claimed;
  return jsonb_build_object('claim_id', claim_id, 'user_ids', user_ids);
end;
$function$;

CREATE OR REPLACE FUNCTION private.enqueue_amplitude_deletion (
  target_user     uuid,
  deletion_reason text
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  insert into private.amplitude_deletion_jobs (user_id, reason)
  values (target_user, deletion_reason)
  on conflict (user_id) where completed_at is null do nothing;
$function$;

CREATE OR REPLACE FUNCTION private.enqueue_amplitude_deletion_on_profile_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if exists (
    select 1 from private.analytics_consent_logs
    where user_id = old.id and item = 'usage_analysis' and is_agreed
  ) and exists (
    select 1 from private.analytics_consent_logs
    where user_id = old.id and item = 'overseas_transfer' and is_agreed
  ) then
    perform private.enqueue_amplitude_deletion(old.id, 'account_deleted');
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION private.finish_amplitude_deletions (
  claim_id   uuid,
  succeeded  boolean,
  error_code text    DEFAULT NULL::text
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  finished integer;
begin
  if claim_id is null or succeeded is null then
    raise exception 'invalid_deletion_result' using errcode = '22023';
  end if;
  update private.amplitude_deletion_jobs as job set
    completed_at = case when succeeded then now() else null end,
    available_at = case when succeeded then job.available_at
      else now() + least(360, power(2, least(job.attempts, 9))) * interval '1 minute' end,
    last_error = case when succeeded then null else left(error_code, 80) end,
    lease_id = null, leased_until = null
  where job.lease_id = finish_amplitude_deletions.claim_id and job.leased_until > now();
  get diagnostics finished = row_count;
  return finished;
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_analytics_consent()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := (select auth.uid());
begin
  perform private.assert_account_access();
  return private.analytics_consent_state(viewer_id);
end;
$function$;

CREATE OR REPLACE FUNCTION private.invoke_amplitude_deletion()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  function_url text;
  deletion_secret text;
begin
  if not exists (
    select 1 from private.amplitude_deletion_jobs
    where completed_at is null and available_at <= now()
      and (leased_until is null or leased_until <= now())
  ) then return null; end if;
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'amplitude_deletion_url';
  select decrypted_secret into deletion_secret from vault.decrypted_secrets where name = 'amplitude_deletion_secret';
  if function_url is null or deletion_secret is null then return null; end if;
  return net.http_post(url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || deletion_secret),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
end;
$function$;

CREATE OR REPLACE FUNCTION private.record_analytics_consent (
  target_user       uuid,
  usage_analysis    boolean,
  overseas_transfer boolean,
  consent_source    text,
  actor             uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  previous jsonb;
  next_state jsonb;
begin
  -- 같은 회원의 동시 변경을 줄 세워 철회 판정이 어긋나지 않게 한다.
  perform 1 from public.profiles where id = target_user for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  previous := private.analytics_consent_state(target_user);
  insert into private.analytics_consent_logs (user_id, item, is_agreed, source, admin_id)
  select target_user, change.item, change.is_agreed, consent_source, actor
  from (values ('usage_analysis', usage_analysis), ('overseas_transfer', overseas_transfer))
    as change (item, is_agreed)
  where not exists (
    select 1 from private.analytics_consent_logs as log
    where log.user_id = target_user and log.item = change.item
  ) or (previous ->> change.item)::boolean is distinct from change.is_agreed;
  next_state := private.analytics_consent_state(target_user);
  if private.analytics_fully_agreed(previous) and not private.analytics_fully_agreed(next_state) then
    perform private.enqueue_amplitude_deletion(target_user, 'consent_withdrawn');
  end if;
  return next_state;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_analytics_consent (
  usage_analysis    boolean,
  overseas_transfer boolean,
  consent_source    text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := (select auth.uid());
begin
  perform private.assert_account_access();
  if usage_analysis is null or overseas_transfer is null or consent_source is null
    or consent_source not in ('signup', 'login', 'settings') then
    raise exception 'invalid_analytics_consent' using errcode = '22023';
  end if;
  return private.record_analytics_consent(viewer_id, usage_analysis, overseas_transfer, consent_source);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_withdraw_analytics_consent (
  actor         uuid,
  actor_session uuid,
  target_email  text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.admin_withdraw_analytics_consent(actor, actor_session, target_email);
$function$;

REVOKE ALL ON FUNCTION "public"."admin_withdraw_analytics_consent"(uuid, uuid, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.claim_amplitude_deletions()
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.claim_amplitude_deletions();
$function$;

REVOKE ALL ON FUNCTION "public"."claim_amplitude_deletions"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.finish_amplitude_deletions (
  claim_id   uuid,
  succeeded  boolean,
  error_code text    DEFAULT NULL::text
)
  RETURNS integer
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.finish_amplitude_deletions(claim_id, succeeded, error_code);
$function$;

REVOKE ALL ON FUNCTION "public"."finish_amplitude_deletions"(uuid, boolean, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_analytics_consent()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select private.get_analytics_consent();
$function$;

REVOKE ALL ON FUNCTION "public"."get_analytics_consent"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.set_analytics_consent (
  usage_analysis    boolean,
  overseas_transfer boolean,
  consent_source    text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.set_analytics_consent(usage_analysis, overseas_transfer, consent_source);
$function$;

REVOKE ALL ON FUNCTION "public"."set_analytics_consent"(boolean, boolean, text) FROM PUBLIC, "anon";

ALTER TABLE "private"."analytics_consent_logs"
  ADD CONSTRAINT "analytics_consent_logs_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES private.admin_users(id);

ALTER TABLE "private"."analytics_consent_logs"
  ADD CONSTRAINT "analytics_consent_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX amplitude_deletion_jobs_due_idx ON private.amplitude_deletion_jobs USING btree (available_at, id)
  WHERE (completed_at IS NULL);

CREATE UNIQUE INDEX amplitude_deletion_jobs_pending_user_idx ON private.amplitude_deletion_jobs USING btree (user_id)
  WHERE (completed_at IS NULL);

CREATE INDEX analytics_consent_logs_admin_idx ON private.analytics_consent_logs USING btree (admin_id);

CREATE INDEX analytics_consent_logs_user_item_idx ON private.analytics_consent_logs USING btree (user_id, item, created_at DESC, id DESC);

CREATE TRIGGER profiles_enqueue_amplitude_deletion
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.enqueue_amplitude_deletion_on_profile_delete();

REVOKE ALL ON FUNCTION "private"."admin_withdraw_analytics_consent"(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."admin_withdraw_analytics_consent"(uuid, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."analytics_consent_state"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."analytics_fully_agreed"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."claim_amplitude_deletions"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."claim_amplitude_deletions"() TO "service_role";

REVOKE ALL ON FUNCTION "private"."enqueue_amplitude_deletion"(uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enqueue_amplitude_deletion_on_profile_delete"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."finish_amplitude_deletions"(uuid, boolean, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."finish_amplitude_deletions"(uuid, boolean, text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."get_analytics_consent"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_analytics_consent"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."invoke_amplitude_deletion"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."record_analytics_consent"(uuid, boolean, boolean, text, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."set_analytics_consent"(boolean, boolean, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."set_analytics_consent"(boolean, boolean, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_withdraw_analytics_consent"(uuid, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_withdraw_analytics_consent"(uuid, uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_withdraw_analytics_consent"(uuid, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_amplitude_deletions"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_amplitude_deletions"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_amplitude_deletions"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."finish_amplitude_deletions"(uuid, boolean, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."finish_amplitude_deletions"(uuid, boolean, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."finish_amplitude_deletions"(uuid, boolean, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_analytics_consent"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_analytics_consent"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_analytics_consent"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_analytics_consent"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_analytics_consent"(boolean, boolean, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_analytics_consent"(boolean, boolean, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_analytics_consent"(boolean, boolean, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_analytics_consent"(boolean, boolean, text) TO "service_role";

SELECT
  cron.schedule_in_database('amplitude-deletion-cleanup', '40 18 * * *', 'delete from private.amplitude_deletion_jobs where completed_at < now() - interval ''35 days''',
  'postgres', NULL, true);

SELECT cron.schedule_in_database('amplitude-deletion-dispatch', '*/10 * * * *', 'select private.invoke_amplitude_deletion()', 'postgres', NULL, true);
