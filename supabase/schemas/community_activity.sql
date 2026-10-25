-- 사용자 ID를 인자로 받지 않는다. 커서는 글 작성 순서와 좋아요 활동 순서를 구분한다.
create or replace function private.get_my_community_activity(
  activity_type text, after_activity_at timestamptz default null, after_id bigint default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
        where l.user_id = viewer_id and p.type = 'post' and p.deleted_at is null and p.hidden_at is null
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
$$;

create or replace function public.get_my_community_activity(
  activity_type text, after_activity_at timestamptz default null, after_id bigint default null
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.get_my_community_activity(activity_type, after_activity_at, after_id);
$$;

revoke execute on function private.get_my_community_activity(text, timestamptz, bigint), public.get_my_community_activity(text, timestamptz, bigint) from public, anon;
grant execute on function private.get_my_community_activity(text, timestamptz, bigint), public.get_my_community_activity(text, timestamptz, bigint) to authenticated;
