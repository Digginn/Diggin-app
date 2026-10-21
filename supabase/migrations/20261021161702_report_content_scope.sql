SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.assert_can_report_community()
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and status <> 'suspended') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.block_community_author (
  content_type text,
  target_id    bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer uuid := (select auth.uid());
  author uuid;
begin
  perform private.assert_can_report_community();
  if content_type is null or content_type not in ('post','comment') or target_id is null or target_id <= 0 then
    raise exception 'invalid_report_target' using errcode = '22023';
  end if;
  -- 신고로 이미 숨겨진 대상도 차단 가능하다. 본인의 신고에 저장된 작성자만 사용한다.
  select r.reported_user_id into author from private.reports r where r.reporter_id = viewer
    and ((content_type = 'post' and r.post_id = target_id) or (content_type = 'comment' and r.comment_id = target_id));
  if author is null then raise exception 'report_target_not_found' using errcode = '42501'; end if;
  if author = viewer then raise exception 'own_block' using errcode = '42501'; end if;
  insert into private.user_blocks(blocker_id, blocked_id) values (viewer, author) on conflict do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION private.community_author_visible (
  target_author_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select not exists (
    select 1 from private.user_blocks b
    where b.blocker_id = (select auth.uid()) and b.blocked_id = target_author_id
  );
$function$;

CREATE OR REPLACE FUNCTION private.community_content_visible (
  content_type public.report_target,
  target_id    bigint
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select not exists (
    select 1 from private.reports r
    where r.reporter_id = (select auth.uid()) and r.target_type = content_type
      and ((content_type = 'post' and r.post_id = target_id) or
           (content_type = 'comment' and r.comment_id = target_id))
  );
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
  from private.posts p where p.id = target_post_id;
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
      'anon_number', a.number
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
    left join private.post_anon_numbers a on a.post_id = c.post_id and a.user_id = c.author_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_community_feed (
  feed_type        text                     DEFAULT 'all'::text,
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
  viewer_id uuid := (select auth.uid());
begin
  if feed_type not in ('all', 'vote') or feed_type is null or
    ((after_created_at is null) <> (after_id is null)) then
    raise exception 'invalid_feed_cursor' using errcode = '22023';
  end if;
  if viewer_id is not null and not exists (
    select 1 from public.profiles where id = viewer_id and status <> 'suspended'
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(private.community_post_json(p.id, viewer_id is null)
      order by p.created_at desc, p.id desc), '[]'::jsonb)
    from (
      select p.id, p.created_at from private.posts p
      where p.deleted_at is null and p.hidden_at is null
        and (feed_type = 'all' or p.type = 'vote')
        and private.community_author_visible(p.author_id)
        and private.community_content_visible('post', p.id)
        and (after_created_at is null or (p.created_at, p.id) < (after_created_at, after_id))
      order by p.created_at desc, p.id desc limit 20
    ) p
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_community_post (
  target_post_id bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.profiles where id = (select auth.uid()) and status <> 'suspended'
  ) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return (
    select private.community_post_json(p.id, false) from private.posts p
    where p.id = target_post_id and p.deleted_at is null and p.hidden_at is null
      and private.community_author_visible(p.author_id)
        and private.community_content_visible('post', p.id)
  );
end;
$function$;

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

CREATE OR REPLACE FUNCTION private.lock_community_post_for_write (
  target_post_id bigint
)
  RETURNS private.posts
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  target private.posts%rowtype;
begin
  perform private.assert_can_write_community();
  select * into target from private.posts where id = target_post_id for update;
  if not found or target.deleted_at is not null or target.hidden_at is not null or
     not private.community_author_visible(target.author_id) or
     not private.community_content_visible('post', target.id) then
    raise exception 'post_not_found' using errcode = '42501';
  end if;
  return target;
end;
$function$;

CREATE OR REPLACE FUNCTION private.report_community_content (
  content_type  text,
  target_id     bigint,
  report_reason text,
  report_detail text   DEFAULT NULL::text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer uuid := (select auth.uid());
  parent private.posts%rowtype;
  comment private.comments%rowtype;
  author uuid;
  saved_id bigint;
  clean_detail text := nullif(normalize(btrim(report_detail), NFC), '');
  parent_id bigint;
begin
  perform private.assert_can_report_community();
  if content_type is null or content_type not in ('post','comment') or target_id is null or target_id <= 0 then
    raise exception 'invalid_report_target' using errcode = '22023';
  end if;
  if report_reason is null or report_reason not in ('abuse','spam','inappropriate','other') or
    (report_reason <> 'other' and clean_detail is not null) or private.char_count(clean_detail) > 50 then
    raise exception 'invalid_report_reason' using errcode = '22023';
  end if;
  -- 동일 신고 재시도는 원래 사유·Snapshot을 보존한다. 동시 요청도 한 건만 생성한다.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(viewer::text || ':' || content_type || ':' || target_id::text, 0));
  select r.id into saved_id from private.reports r where r.reporter_id = viewer
    and ((content_type = 'post' and r.post_id = target_id) or (content_type = 'comment' and r.comment_id = target_id));
  if saved_id is not null then return saved_id::text; end if;
  if content_type = 'post' then parent_id := target_id;
  else
    select c.post_id into parent_id from private.comments c where c.id = target_id;
  end if;
  -- 기존 댓글 수정·삭제와 같은 부모 → 댓글 잠금 순서로 Snapshot 경합을 막는다.
  select * into parent from private.posts where id = parent_id for update;
  if not found or parent.deleted_at is not null or parent.hidden_at is not null or
    not private.community_author_visible(parent.author_id) or
    not private.community_content_visible('post', parent.id) then
    raise exception 'report_target_not_found' using errcode = '42501';
  end if;
  if content_type = 'comment' then
    select * into comment from private.comments where id = target_id for update;
    if not found or comment.deleted_at is not null or comment.hidden_at is not null or
      comment.author_id is null or not private.community_author_visible(comment.author_id) or
      not private.community_content_visible('comment', comment.id) then
      raise exception 'report_target_not_found' using errcode = '42501';
    end if;
    author := comment.author_id;
  else author := parent.author_id;
  end if;
  if author = viewer then raise exception 'own_report' using errcode = '42501'; end if;
  insert into private.reports(reporter_id, target_type, post_id, comment_id, reported_user_id, reason, detail, reported_content)
  values (viewer, content_type::public.report_target,
    case when content_type = 'post' then target_id end,
    case when content_type = 'comment' then target_id end, author, report_reason::public.report_reason,
    clean_detail, case when content_type = 'comment' then comment.content end)
  returning id into saved_id;
  return saved_id::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.block_community_author (
  target_type text,
  target_id   bigint
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.block_community_author(target_type, target_id);
$function$;

CREATE OR REPLACE FUNCTION public.report_community_content (
  target_type   text,
  target_id     bigint,
  report_reason text,
  report_detail text   DEFAULT NULL::text
)
  RETURNS text
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.report_community_content(target_type, target_id, report_reason, report_detail);
$function$;

REVOKE ALL ON FUNCTION "private"."community_content_visible"(public.report_target, bigint) FROM PUBLIC;
