SET local check_function_bodies = off;

CREATE EXTENSION "pg_cron";

CREATE TABLE "private"."like_notification_log" (
  "post_id"    bigint                   NOT NULL,
  "actor_id"   uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "like_notification_log_pkey" PRIMARY KEY (post_id, actor_id)
);

ALTER TABLE "private"."like_notification_log"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."notification_checks" (
  "user_id"    uuid                     NOT NULL,
  "checked_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "notification_checks_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "private"."notification_checks"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."notifications" (
  "id"           bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "recipient_id" uuid                     NOT NULL,
  "post_id"      bigint                   NOT NULL,
  "title"        text                     NOT NULL,
  "body"         text                     NOT NULL,
  "event_key"    text                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "push_sent_at" timestamp with time zone,
  CONSTRAINT "notifications_event_key_key" UNIQUE (event_key),
  CONSTRAINT "notifications_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."notifications"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."notification_type" AS ENUM (
  'vote_ended',
  'post_commented',
  'post_liked'
);

ALTER TABLE "private"."notifications"
  ADD COLUMN "type" public.notification_type NOT NULL;

CREATE OR REPLACE FUNCTION private.create_vote_ended_notifications()
  RETURNS integer
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with inserted as (
    insert into private.notifications(recipient_id, type, post_id, title, body, event_key)
    select p.author_id, 'vote_ended', p.id, '투표 결과가 나왔어요.',
      '''' || private.notification_text(p.content) || ''' 투표가 종료됐어요. BUY ' ||
        (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'buy') ||
        ' · NOT ' ||
        (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'not'),
      'vote_ended:' || p.id
    from private.posts p
    where p.type = 'vote' and p.ends_at <= now() and p.ends_at > now() - interval '30 days'
      and (p.deleted_at is null or p.deleted_at > p.ends_at)
      and (p.hidden_at is null or p.hidden_at > p.ends_at)
    on conflict (event_key) do nothing
    returning 1
  )
  select count(*)::integer from inserted;
$function$;

CREATE OR REPLACE FUNCTION private.delete_old_notifications()
  RETURNS integer
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with deleted as (
    delete from private.notifications where created_at < now() - interval '30 days' returning 1
  )
  select count(*)::integer from deleted;
$function$;

CREATE OR REPLACE FUNCTION private.get_notifications (
  after_created_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id         bigint                   DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := private.notification_viewer();
begin
  if (after_created_at is null) <> (after_id is null) then
    raise exception 'invalid_notification_cursor' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id::text, 'type', n.type, 'title', n.title, 'body', n.body, 'created_at', n.created_at,
      'post_id', n.post_id::text, 'post_type', p.type,
      'is_post_available', p.deleted_at is null and p.hidden_at is null
    ) order by n.created_at desc, n.id desc), '[]'::jsonb)
    from (
      select * from private.notifications
      where recipient_id = viewer_id and created_at > now() - interval '30 days'
        and (after_created_at is null or (created_at, id) < (after_created_at, after_id))
      order by created_at desc, id desc limit 20
    ) n
    join private.posts p on p.id = n.post_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.has_unread_notifications()
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := private.notification_viewer();
begin
  return exists (
    select 1 from private.notifications n
    where n.recipient_id = viewer_id and n.created_at > now() - interval '30 days'
      and n.created_at > coalesce(
        (select c.checked_at from private.notification_checks c where c.user_id = viewer_id), '-infinity')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.mark_notifications_checked()
  RETURNS timestamp WITH time zone
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := private.notification_viewer();
  previous timestamptz;
begin
  select checked_at into previous from private.notification_checks where user_id = viewer_id for update;
  insert into private.notification_checks(user_id, checked_at) values (viewer_id, now())
  on conflict (user_id) do update set checked_at = excluded.checked_at;
  return previous;
end;
$function$;

CREATE OR REPLACE FUNCTION private.notification_actor_visible (
  recipient uuid,
  actor     uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select not exists (
    select 1 from private.user_blocks b where b.blocker_id = recipient and b.blocked_id = actor
  ) and not exists (
    select 1 from private.reports r where r.reporter_id = recipient and r.reported_user_id = actor
  );
$function$;

CREATE OR REPLACE FUNCTION private.notification_text (
  value text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select regexp_replace(coalesce(value, ''), '\r\n|\r|\n', ' ', 'g');
$function$;

CREATE OR REPLACE FUNCTION private.notification_viewer()
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := (select auth.uid());
begin
  if viewer_id is null or not exists (
    select 1 from public.profiles where id = viewer_id and status <> 'suspended'
  ) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return viewer_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.notify_post_commented()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target private.posts%rowtype;
  anon_number integer;
begin
  select * into target from private.posts where id = new.post_id;
  if target.type <> 'post' or target.deleted_at is not null or target.hidden_at is not null or
     new.author_id is null or new.author_id = target.author_id or
     not private.notification_actor_visible(target.author_id, new.author_id) then
    return new;
  end if;
  select number into anon_number from private.post_anon_numbers
  where post_id = new.post_id and user_id = new.author_id;
  insert into private.notifications(recipient_id, type, post_id, title, body, event_key)
  values (target.author_id, 'post_commented', target.id, '내 게시글에 댓글이 달렸어요.',
          '디기 ' || coalesce(anon_number::text, '') || ': ' || private.notification_text(new.content),
          'comment:' || new.id)
  on conflict (event_key) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.notify_post_liked()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target private.posts%rowtype;
begin
  select * into target from private.posts where id = new.post_id;
  if target.type <> 'post' or target.deleted_at is not null or target.hidden_at is not null or
     new.user_id is null or new.user_id = target.author_id or
     not private.notification_actor_visible(target.author_id, new.user_id) then
    return new;
  end if;
  insert into private.like_notification_log(post_id, actor_id) values (new.post_id, new.user_id)
  on conflict do nothing;
  if not found then return new; end if;
  insert into private.notifications(recipient_id, type, post_id, title, body, event_key)
  values (target.author_id, 'post_liked', target.id, '내 게시글에 좋아요가 달렸어요.',
          '''' || private.notification_text(target.content) || ''' 게시글을 누군가 좋아해요.',
          'like:' || new.post_id || ':' || new.user_id)
  on conflict (event_key) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_notifications (
  after_created_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id         bigint                   DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.get_notifications(after_created_at, after_id);
$function$;

REVOKE ALL ON FUNCTION "public"."get_notifications"(timestamp WITH time zone, bigint) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.has_unread_notifications()
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.has_unread_notifications();
$function$;

REVOKE ALL ON FUNCTION "public"."has_unread_notifications"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.mark_notifications_checked()
  RETURNS timestamp WITH time zone
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.mark_notifications_checked();
$function$;

REVOKE ALL ON FUNCTION "public"."mark_notifications_checked"() FROM PUBLIC, "anon";

ALTER TABLE "private"."like_notification_log"
  ADD CONSTRAINT "like_notification_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "private"."like_notification_log"
  ADD CONSTRAINT "like_notification_log_post_id_fkey" FOREIGN KEY (post_id) REFERENCES private.posts(id) ON DELETE CASCADE;

ALTER TABLE "private"."notification_checks"
  ADD CONSTRAINT "notification_checks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "private"."notifications"
  ADD CONSTRAINT "notifications_post_id_fkey" FOREIGN KEY (post_id) REFERENCES private.posts(id) ON DELETE CASCADE;

ALTER TABLE "private"."notifications"
  ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX like_notification_log_actor_idx ON private.like_notification_log USING btree (actor_id);

CREATE INDEX notifications_post_idx ON private.notifications USING btree (post_id);

CREATE INDEX notifications_push_pending_idx ON private.notifications USING btree (created_at)
  WHERE (push_sent_at IS NULL);

CREATE INDEX notifications_recipient_idx ON private.notifications USING btree (recipient_id, created_at DESC, id DESC);

CREATE TRIGGER comments_notify_post_author
  AFTER INSERT ON private.comments
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_post_commented();

CREATE TRIGGER post_likes_notify_post_author
  AFTER INSERT ON private.post_likes
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_post_liked();

COMMENT ON EXTENSION "pg_cron" IS 'Job scheduler for PostgreSQL';

REVOKE ALL ON FUNCTION "private"."create_vote_ended_notifications"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."delete_old_notifications"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."get_notifications"(timestamp WITH time zone, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_notifications"(timestamp WITH time zone, bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."has_unread_notifications"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."has_unread_notifications"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."mark_notifications_checked"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."mark_notifications_checked"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."notification_actor_visible"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."notification_text"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."notification_viewer"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."notify_post_commented"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."notify_post_liked"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_notifications"(timestamp WITH time zone, bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_notifications"(timestamp WITH time zone, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_notifications"(timestamp WITH time zone, bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_notifications"(timestamp WITH time zone, bigint) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."has_unread_notifications"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."has_unread_notifications"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."has_unread_notifications"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."has_unread_notifications"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."mark_notifications_checked"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."mark_notifications_checked"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mark_notifications_checked"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."mark_notifications_checked"() TO "service_role";

SELECT cron.schedule_in_database('notifications-cleanup', '0 18 * * *', 'select private.delete_old_notifications()', 'postgres', NULL, true);

SELECT cron.schedule_in_database('notifications-vote-ended', '* * * * *', 'select private.create_vote_ended_notifications()', 'postgres', NULL, true);
