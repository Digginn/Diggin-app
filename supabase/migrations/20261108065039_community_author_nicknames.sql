-- #195: Generated declarative diff; unrelated existing round-trip changes excluded.
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.community_comment_json (
  target_comment_id bigint
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'id', c.id::text, 'created_at', c.created_at,
    'content', case when c.author_id is null then null else c.content end,
    'is_post_author', c.author_id = p.author_id,
    'is_mine', c.author_id = (select auth.uid()), 'is_withdrawn', c.author_id is null,
    'anon_number', a.number, 'author_nickname', author.nickname
  ) from private.comments c join private.posts p on p.id = c.post_id
  left join public.profiles author on author.id = c.author_id
  left join private.post_anon_numbers a on a.post_id = c.post_id and a.user_id = c.author_id
  where c.id = target_comment_id;
$function$;

CREATE OR REPLACE FUNCTION private.community_post_json (
  target_post_id bigint,
  is_preview     boolean
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select case when is_preview then jsonb_build_object(
    'id', p.id::text, 'type', p.type, 'created_at', p.created_at,
    'content', split_part(replace(p.content, E'\r', ''), E'\n', 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'position', i.position, 'image_url', i.image_url) order by i.position)
      from private.post_products i where i.post_id = p.id), '[]'::jsonb)
  ) else jsonb_build_object(
    'id', p.id::text, 'type', p.type, 'created_at', p.created_at, 'ends_at', p.ends_at,
    'server_now', now(), 'content', p.content, 'is_mine', p.author_id = (select auth.uid()),
    'author_nickname', author.nickname,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'position', i.position, 'name', i.name, 'brand', i.brand, 'price', i.price,
      'url', i.url, 'image_url', i.image_url) order by i.position)
      from private.post_products i where i.post_id = p.id), '[]'::jsonb),
    'like_count', (select count(*) from private.post_likes l where l.post_id = p.id),
    'is_liked', exists(select 1 from private.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
    'comment_count', (select count(*) from private.comments c where c.post_id = p.id
      and c.deleted_at is null and c.hidden_at is null and private.community_author_visible(c.author_id)
        and private.community_content_visible('comment', c.id)),
    'my_choice', (select v.choice from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid())),
    'buy_count', case when p.type = 'vote' and (p.author_id = (select auth.uid()) or p.ends_at <= now() or
      exists(select 1 from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid())))
      then (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'buy') else null end,
    'not_count', case when p.type = 'vote' and (p.author_id = (select auth.uid()) or p.ends_at <= now() or
      exists(select 1 from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid())))
      then (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'not') else null end
  ) end
  from private.posts p join public.profiles author on author.id = p.author_id
  where p.id = target_post_id;
$function$;

CREATE OR REPLACE FUNCTION private.get_community_comments (
  target_post_id   bigint,
  after_created_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id         bigint                   DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if private.get_community_post(target_post_id) is null then return '[]'::jsonb; end if;
  if (after_created_at is null) <> (after_id is null) then
    raise exception 'invalid_comment_cursor' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id::text, 'created_at', c.created_at,
      'content', case when c.author_id is null then null else c.content end,
      'is_post_author', c.author_id = p.author_id,
      'is_mine', c.author_id = (select auth.uid()), 'is_withdrawn', c.author_id is null,
      'anon_number', a.number, 'author_nickname', author.nickname
    ) order by c.created_at, c.id), '[]'::jsonb)
    from (
      select c.* from private.comments c
      where c.post_id = target_post_id and c.deleted_at is null and c.hidden_at is null
        and private.community_author_visible(c.author_id)
        and private.community_content_visible('comment', c.id)
        and (after_created_at is null or (c.created_at, c.id) > (after_created_at, after_id))
      order by c.created_at, c.id limit 20
    ) c
    join private.posts p on p.id = c.post_id
    left join public.profiles author on author.id = c.author_id
    left join private.post_anon_numbers a on a.post_id = c.post_id and a.user_id = c.author_id
  );
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
  actor_nickname text;
begin
  select * into target from private.posts where id = new.post_id;
  if target.type <> 'post' or target.deleted_at is not null or target.hidden_at is not null or
     new.author_id is null or new.author_id = target.author_id or
     not private.notification_actor_visible(target.author_id, new.author_id) then
    return new;
  end if;
  select nickname into actor_nickname from public.profiles where id = new.author_id;
  insert into private.notifications(recipient_id, type, post_id, actor_id, title, body, event_key)
  values (target.author_id, 'post_commented', target.id, new.author_id, '내 게시글에 댓글이 달렸어요.',
          coalesce(actor_nickname, '사용자') || ': ' || private.notification_text(new.content),
          'comment:' || new.id)
  on conflict (event_key) do nothing;
  return new;
end;
$function$;
