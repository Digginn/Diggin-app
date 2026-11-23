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
  recipient uuid;
begin
  select * into target from private.posts where id = new.post_id;
  if target.deleted_at is not null or target.hidden_at is not null or new.author_id is null or
     (new.parent_id is null and target.type <> 'post') then
    return new;
  end if;
  if new.parent_id is null then recipient := target.author_id;
  else select author_id into recipient from private.comments where id = new.parent_id;
  end if;
  if recipient is null or recipient = new.author_id or
     not private.notification_actor_visible(recipient, new.author_id) then
    return new;
  end if;
  select nickname into actor_nickname from public.profiles where id = new.author_id;
  insert into private.notifications(recipient_id, type, post_id, actor_id, title, body, event_key)
  values (recipient, 'post_commented', target.id, new.author_id,
          case when new.parent_id is null then '내 게시글에 댓글이 달렸어요.' else '내 댓글에 답글이 달렸어요.' end,
          coalesce(actor_nickname, '사용자') || ': ' || private.notification_text(new.content),
          case when new.parent_id is null then 'comment:' else 'reply:' end || new.id)
  on conflict (event_key) do nothing;
  return new;
end;
$function$;
