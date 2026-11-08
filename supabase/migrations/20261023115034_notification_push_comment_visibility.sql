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
      and (n.type <> 'post_commented' or exists (
        select 1 from private.comments c
        where c.post_id = n.post_id and n.event_key = 'comment:' || c.id
          and c.deleted_at is null
      ))
      and (n.actor_id is null or private.notification_actor_visible(n.recipient_id, n.actor_id))
  );
$function$;
