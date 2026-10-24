SET local check_function_bodies = off;

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
  if target.deleted_at is not null or target.hidden_at is not null or
     new.user_id is null or new.user_id = target.author_id or
     not private.notification_actor_visible(target.author_id, new.user_id) then
    return new;
  end if;
  insert into private.like_notification_log(post_id, actor_id) values (new.post_id, new.user_id)
  on conflict do nothing;
  if not found then return new; end if;
  insert into private.notifications(recipient_id, type, post_id, actor_id, title, body, event_key)
  values (target.author_id, 'post_liked', target.id, new.user_id, '내 게시글에 좋아요가 달렸어요.',
          '''' || private.notification_text(target.content) || ''' 게시글을 누군가 좋아해요.',
          'like:' || new.post_id || ':' || new.user_id)
  on conflict (event_key) do nothing;
  return new;
end;
$function$;
