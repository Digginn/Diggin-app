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
        and (after_activity_at is null or (p.created_at, p.id) < (after_activity_at, after_id))
      order by p.created_at desc, p.id desc limit 20
    ) page
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_community_activity (
  activity_type     text,
  after_activity_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id          bigint                   DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.get_my_community_activity(activity_type, after_activity_at, after_id);
$function$;

REVOKE ALL ON FUNCTION "public"."get_my_community_activity"(text, timestamp WITH time zone, bigint) FROM PUBLIC, "anon";

REVOKE ALL ON FUNCTION "private"."get_my_community_activity"(text, timestamp WITH time zone, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_my_community_activity"(text, timestamp WITH time zone, bigint) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_my_community_activity"(text, timestamp WITH time zone, bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_my_community_activity"(text, timestamp WITH time zone, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_community_activity"(text, timestamp WITH time zone, bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_community_activity"(text, timestamp WITH time zone, bigint) TO "service_role";
