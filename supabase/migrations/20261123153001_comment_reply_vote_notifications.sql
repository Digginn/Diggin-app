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
  is_author_notified boolean := false;
begin
  select * into target from private.posts where id = new.post_id;
  if target.deleted_at is not null or target.hidden_at is not null or new.author_id is null then
    return new;
  end if;
  select nickname into actor_nickname from public.profiles where id = new.author_id;
  -- NOTI-004 댓글 알림은 일반 게시글만, NOTI-010 답글 알림은 투표글에도 보낸다.
  if target.type = 'post' and new.author_id <> target.author_id and
     private.notification_actor_visible(target.author_id, new.author_id) then
    is_author_notified := true;
    insert into private.notifications(recipient_id, type, post_id, actor_id, title, body, event_key)
    values (target.author_id, 'post_commented', target.id, new.author_id, '내 게시글에 댓글이 달렸어요.',
            coalesce(actor_nickname, '사용자') || ': ' || private.notification_text(new.content),
            'comment:' || new.id)
    on conflict (event_key) do nothing;
  end if;
  if new.parent_id is not null then
    select author_id into parent_author from private.comments where id = new.parent_id;
    -- 원 댓글 작성자가 글쓴이라 댓글 알림을 이미 받았으면 같은 답글로 두 번 알리지 않는다.
    if parent_author is not null and parent_author <> new.author_id and
       not (is_author_notified and parent_author = target.author_id) and
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
