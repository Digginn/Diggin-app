SET local check_function_bodies = off;

CREATE EXTENSION "pg_net" SCHEMA "extensions";

ALTER TABLE "private"."notifications"
  ADD COLUMN "push_claimed_at" timestamp WITH time zone;

CREATE OR REPLACE FUNCTION private.claim_push_notifications (
  batch_size integer DEFAULT 100
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  claimed jsonb;
begin
  if batch_size is null or batch_size not between 1 and 500 then
    raise exception 'invalid_batch_size' using errcode = '22023';
  end if;
  update private.notifications n set push_sent_at = now()
  where n.push_sent_at is null and (
    n.created_at <= now() - interval '24 hours'
    or exists (select 1 from private.notification_settings s where s.user_id = n.recipient_id and not s.push_enabled)
    or exists (select 1 from public.profiles p where p.id = n.recipient_id and p.status = 'suspended')
    or not exists (select 1 from public.push_tokens t where t.user_id = n.recipient_id)
    or (n.actor_id is not null and not private.notification_actor_visible(n.recipient_id, n.actor_id))
  );
  with picked as (
    select n.id from private.notifications n
    where n.push_sent_at is null
      and (n.push_claimed_at is null or n.push_claimed_at < now() - interval '5 minutes')
    order by n.created_at, n.id
    limit batch_size
    for update skip locked
  ), claimed_rows as (
    update private.notifications n set push_claimed_at = now()
    from picked where n.id = picked.id
    returning n.*
  )
  -- Push 문구는 시안 NOTI-03~05. 투표 마감만 목록과 다르고, 좋아요는 본문 자리에 게시글 본문을 쓴다.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id::text,
    'title', case r.type when 'vote_ended' then '투표가 종료됐어요.' else r.title end,
    'body', case r.type
      when 'vote_ended' then '내 투표 결과를 확인해 보세요.'
      when 'post_liked' then private.notification_text(p.content)
      else r.body end,
    'post_id', r.post_id::text,
    'post_type', p.type,
    'tokens', (select jsonb_agg(t.token order by t.id) from public.push_tokens t where t.user_id = r.recipient_id)
  ) order by r.created_at, r.id), '[]'::jsonb) into claimed
  from claimed_rows r join private.posts p on p.id = r.post_id;
  return claimed;
end;
$function$;

CREATE OR REPLACE FUNCTION private.complete_push_notifications (
  sent_ids    bigint[],
  dead_tokens text[]
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  update private.notifications set push_sent_at = now()
  where id = any(coalesce(sent_ids, '{}')) and push_sent_at is null;
  delete from public.push_tokens where token = any(coalesce(dead_tokens, '{}'));
$function$;

CREATE OR REPLACE FUNCTION private.invoke_push_send()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  project_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  secret_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key');
begin
  if project_url is null or secret_key is null then
    return null;
  end if;
  return net.http_post(
    url := project_url || '/functions/v1/push-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', secret_key),
    body := '{}'::jsonb
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_push_notifications (
  batch_size integer DEFAULT 100
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.claim_push_notifications(batch_size);
$function$;

REVOKE ALL ON FUNCTION "public"."claim_push_notifications"(integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.complete_push_notifications (
  sent_ids    bigint[],
  dead_tokens text[]
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.complete_push_notifications(sent_ids, dead_tokens);
$function$;

REVOKE ALL ON FUNCTION "public"."complete_push_notifications"(bigint[], text[]) FROM PUBLIC, "anon", "authenticated";

COMMENT ON EXTENSION "pg_net" IS 'Async HTTP';

REVOKE ALL ON FUNCTION "private"."claim_push_notifications"(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."claim_push_notifications"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "private"."complete_push_notifications"(bigint[], text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."complete_push_notifications"(bigint[], text[]) TO "service_role";

REVOKE ALL ON FUNCTION "private"."invoke_push_send"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."claim_push_notifications"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_push_notifications"(integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_push_notifications"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."complete_push_notifications"(bigint[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."complete_push_notifications"(bigint[], text[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."complete_push_notifications"(bigint[], text[]) TO "service_role";

SELECT cron.schedule_in_database('notifications-push-send', '* * * * *', 'select private.invoke_push_send()', 'postgres', NULL, true);
