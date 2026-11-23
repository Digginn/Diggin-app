SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.notify_post_commented()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target private.posts%rowtype;
  actor_nickname text;
  parent_author uuid;
begin
  select * into target from private.posts where id = new.post_id;
  if target.type <> 'post' or target.deleted_at is not null or target.hidden_at is not null or
     new.author_id is null then
    return new;
  end if;
  select nickname into actor_nickname from public.profiles where id = new.author_id;
  if new.author_id <> target.author_id and
     private.notification_actor_visible(target.author_id, new.author_id) then
    insert into private.notifications(recipient_id, type, post_id, actor_id, title, body, event_key)
    values (target.author_id, 'post_commented', target.id, new.author_id, '내 게시글에 댓글이 달렸어요.',
            coalesce(actor_nickname, '사용자') || ': ' || private.notification_text(new.content),
            'comment:' || new.id)
    on conflict (event_key) do nothing;
  end if;
  if new.parent_id is not null then
    select author_id into parent_author from private.comments where id = new.parent_id;
    if parent_author is not null and parent_author <> new.author_id and parent_author <> target.author_id and
       private.notification_actor_visible(parent_author, new.author_id) then
      insert into private.notifications(recipient_id, type, post_id, actor_id, title, body, event_key)
      values (parent_author, 'post_commented', target.id, new.author_id, '내 댓글에 답글이 달렸어요.',
              coalesce(actor_nickname, '사용자') || ': ' || private.notification_text(new.content),
              'reply:' || new.id)
      on conflict (event_key) do nothing;
    end if;
  end if;
  return new;
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
      and (n.type <> 'post_commented' or exists (
        select 1 from private.comments c
        where c.post_id = n.post_id and n.event_key in ('comment:' || c.id, 'reply:' || c.id)
          and c.deleted_at is null
      ))
      and (n.actor_id is null or private.notification_actor_visible(n.recipient_id, n.actor_id))
  );
$function$;
