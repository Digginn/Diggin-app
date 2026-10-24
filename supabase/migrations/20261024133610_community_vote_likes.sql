SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.get_my_community_activity (
  activity_type     text,
  after_activity_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id          bigint                   DEFAULT NULL::bigint
)
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
  if viewer_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = viewer_id and status <> 'suspended') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if activity_type is null or activity_type not in ('post', 'vote', 'liked') or
     ((after_activity_at is null) <> (after_id is null)) or
     (after_activity_at is not null and (not isfinite(after_activity_at) or after_id <= 0)) then
    raise exception 'invalid_activity_cursor' using errcode = '22023';
  end if;
  if activity_type = 'liked' then
    return (
      select coalesce(jsonb_agg(jsonb_build_object(
        'post', private.community_post_json(page.post_id, false),
        'activity_at', page.created_at, 'activity_id', page.id::text
      ) order by page.created_at desc, page.id desc), '[]'::jsonb)
      from (
        select l.post_id, l.created_at, l.id
        from private.post_likes l join private.posts p on p.id = l.post_id
        where l.user_id = viewer_id and p.deleted_at is null and p.hidden_at is null
          and private.community_author_visible(p.author_id)
          and private.community_content_visible('post', p.id)
          and (after_activity_at is null or (l.created_at, l.id) < (after_activity_at, after_id))
        order by l.created_at desc, l.id desc limit 20
      ) page
    );
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'post', private.community_post_json(page.id, false),
      'activity_at', page.created_at, 'activity_id', page.id::text
    ) order by page.created_at desc, page.id desc), '[]'::jsonb)
    from (
      select p.id, p.created_at from private.posts p
      where p.author_id = viewer_id and p.type = activity_type::public.post_type
        and p.deleted_at is null and p.hidden_at is null and private.community_author_visible(p.author_id)
          and private.community_content_visible('post', p.id)
        and (after_activity_at is null or (p.created_at, p.id) < (after_activity_at, after_id))
      order by p.created_at desc, p.id desc limit 20
    ) page
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_community_like (
  target_post_id bigint,
  is_liked       boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target private.posts%rowtype;
begin
  target := private.lock_community_post_for_write(target_post_id);
  if is_liked is null then raise exception 'invalid_like_state' using errcode = '22023'; end if;
  if is_liked then
    insert into private.post_likes(post_id, user_id) values (target.id, (select auth.uid())) on conflict do nothing;
  else
    delete from private.post_likes where post_id = target.id and user_id = (select auth.uid());
  end if;
  return jsonb_build_object('is_liked', is_liked, 'like_count', (select count(*) from private.post_likes where post_id = target.id));
end;
$function$;
