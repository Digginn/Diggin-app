SET local check_function_bodies = off;

CREATE EXTENSION "pg_net" SCHEMA "extensions";

CREATE TABLE "private"."notification_push_deliveries" (
  "id"               bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "notification_id"  bigint                   NOT NULL,
  "token_id"         bigint                   NOT NULL,
  "token_updated_at" timestamp with time zone NOT NULL,
  "state"            text                     NOT NULL DEFAULT 'pending'::text,
  "ticket_id"        text,
  "attempts"         integer                  NOT NULL DEFAULT 0,
  "available_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "lease_id"         uuid,
  "leased_until"     timestamp with time zone,
  "last_error"       text,
  CONSTRAINT "notification_push_deliveries_notification_id_token_id_key" UNIQUE (notification_id, token_id),
  CONSTRAINT "notification_push_deliveries_pkey" PRIMARY KEY (id),
  CONSTRAINT "notification_push_deliveries_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'receipt'::text, 'delivered'::text, 'failed'::text, 'skipped'::text])))
);

ALTER TABLE "private"."notification_push_deliveries"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.claim_notification_pushes (
  receipts boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  jobs jsonb;
begin
  with candidates as (
    select d.id from private.notification_push_deliveries d
    where d.state = case when receipts then 'receipt' else 'pending' end
      and d.available_at <= now() and (d.leased_until is null or d.leased_until <= now())
    order by d.available_at, d.id limit 100 for update skip locked
  ), claimed as (
    update private.notification_push_deliveries d
    set lease_id = gen_random_uuid(), leased_until = now() + interval '5 minutes', attempts = attempts + 1
    from candidates c where d.id = c.id returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id::text, 'lease_id', d.lease_id, 'ticket_id', d.ticket_id,
    'allowed', private.push_notification_allowed(n.id, t.id),
    'expired', n.created_at <= now() - interval '24 hours',
    'token', t.token, 'recipient_id', n.recipient_id, 'post_id', p.id::text, 'post_type', p.type,
    'title', case when n.type = 'vote_ended' then '투표가 종료됐어요.' else n.title end,
    'body', case when n.type = 'vote_ended' then '내 투표 결과를 확인해 보세요.'
      when n.type = 'post_liked' then private.notification_text(p.content) else n.body end
  ) order by d.id), '[]'::jsonb) into jobs
  from claimed d join private.notifications n on n.id = d.notification_id
  join private.posts p on p.id = n.post_id join public.push_tokens t on t.id = d.token_id;
  return jobs;
end;
$function$;

CREATE OR REPLACE FUNCTION private.enqueue_notification_push()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into private.notification_push_deliveries(notification_id, token_id, token_updated_at)
  select new.id, t.id, t.updated_at from public.push_tokens t
  where t.user_id = new.recipient_id
    and t.token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'
    and private.push_notification_allowed(new.id, t.id)
  on conflict do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.finish_notification_push (
  delivery_id bigint,
  claim_id    uuid,
  outcome     text,
  ticket      text   DEFAULT NULL::text,
  error_code  text   DEFAULT NULL::text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  job private.notification_push_deliveries%rowtype;
begin
  if outcome not in ('accepted','delivered','retry','receipt_retry','failed','unregistered','skipped')
     or (outcome = 'accepted' and (ticket is null or length(ticket) > 128)) then
    raise exception 'invalid_push_result' using errcode = '22023';
  end if;
  select * into job from private.notification_push_deliveries
  where id = delivery_id and lease_id = claim_id and leased_until > now() for update;
  if not found then return false; end if;
  if outcome = 'unregistered' then
    -- 등록 이후 갱신/계정 전환된 토큰은 과거 receipt로 지우지 않는다.
    delete from public.push_tokens t using private.notifications n
    where t.id = job.token_id and n.id = job.notification_id and t.user_id = n.recipient_id
      and t.updated_at = job.token_updated_at;
  end if;
  update private.notification_push_deliveries set
    state = case outcome when 'accepted' then 'receipt' when 'delivered' then 'delivered'
      when 'retry' then 'pending' when 'receipt_retry' then 'receipt'
      when 'skipped' then 'skipped' else 'failed' end,
    ticket_id = case when outcome = 'accepted' then ticket
      when outcome = 'retry' then null else ticket_id end,
    available_at = now() + case when outcome = 'accepted' then interval '15 minutes'
      else least(60, power(2, least(job.attempts, 6))) * interval '1 minute' end,
    lease_id = null, leased_until = null, last_error = left(error_code, 80)
  where id = job.id;
  update private.notifications n set push_sent_at = coalesce(n.push_sent_at, now())
  where n.id = job.notification_id
    and exists (select 1 from private.notification_push_deliveries d
      where d.notification_id = n.id and d.state in ('receipt','delivered'))
    and not exists (select 1 from private.notification_push_deliveries d
      where d.notification_id = n.id and d.state in ('pending','failed'));
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION private.invoke_notification_push()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  function_url text;
  dispatch_secret text;
begin
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if function_url is null or dispatch_secret is null then return null; end if;
  return net.http_post(url := function_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || dispatch_secret),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
end;
$function$;

CREATE OR REPLACE FUNCTION private.push_notification_allowed (
  notification_id bigint,
  token_id        bigint
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from private.notifications n
    join private.posts p on p.id = n.post_id
    join public.profiles u on u.id = n.recipient_id
    join public.push_tokens t on t.id = token_id and t.user_id = n.recipient_id
    left join private.notification_settings s on s.user_id = n.recipient_id
    where n.id = notification_id and n.created_at > now() - interval '24 hours'
      and u.status <> 'suspended' and coalesce(s.push_enabled, true)
      and p.deleted_at is null and p.hidden_at is null
      and (n.actor_id is null or private.notification_actor_visible(n.recipient_id, n.actor_id))
  );
$function$;

CREATE OR REPLACE FUNCTION public.claim_notification_pushes (
  receipts boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.claim_notification_pushes(receipts);
$function$;

REVOKE ALL ON FUNCTION "public"."claim_notification_pushes"(boolean) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.finish_notification_push (
  delivery_id bigint,
  claim_id    uuid,
  outcome     text,
  ticket      text   DEFAULT NULL::text,
  error_code  text   DEFAULT NULL::text
)
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.finish_notification_push(delivery_id, claim_id, outcome, ticket, error_code);
$function$;

REVOKE ALL ON FUNCTION "public"."finish_notification_push"(bigint, uuid, text, text, text) FROM PUBLIC, "anon", "authenticated";

ALTER TABLE "private"."notification_push_deliveries"
  ADD CONSTRAINT "notification_push_deliveries_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES private.notifications(id) ON DELETE CASCADE;

ALTER TABLE "private"."notification_push_deliveries"
  ADD CONSTRAINT "notification_push_deliveries_token_id_fkey" FOREIGN KEY (token_id) REFERENCES public.push_tokens(id) ON DELETE CASCADE;

CREATE INDEX notification_push_due_idx ON private.notification_push_deliveries USING btree (available_at, id)
  WHERE (state = ANY (ARRAY['pending'::text, 'receipt'::text]));

CREATE INDEX notification_push_token_idx ON private.notification_push_deliveries USING btree (token_id);

CREATE TRIGGER notifications_enqueue_push
  AFTER INSERT ON private.notifications
  FOR EACH ROW
  EXECUTE FUNCTION private.enqueue_notification_push();

COMMENT ON EXTENSION "pg_net" IS 'Async HTTP';

REVOKE ALL ON FUNCTION "private"."claim_notification_pushes"(boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."claim_notification_pushes"(boolean) TO "service_role";

REVOKE ALL ON FUNCTION "private"."enqueue_notification_push"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."finish_notification_push"(bigint, uuid, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."finish_notification_push"(bigint, uuid, text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."invoke_notification_push"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."push_notification_allowed"(bigint, bigint) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."claim_notification_pushes"(boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_notification_pushes"(boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_notification_pushes"(boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."finish_notification_push"(bigint, uuid, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."finish_notification_push"(bigint, uuid, text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."finish_notification_push"(bigint, uuid, text, text, text) TO "service_role";

SELECT cron.schedule_in_database('notifications-push-dispatch', '* * * * *', 'select private.invoke_notification_push()', 'postgres', NULL, true);
