SET local check_function_bodies = off;

DROP INDEX "private"."comments_parent_idx";

CREATE OR REPLACE FUNCTION private.admin_report_detail (
  actor            uuid,
  actor_session    uuid,
  report           bigint,
  before_report_id bigint DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r private.reports%rowtype; result jsonb;
begin
  perform private.assert_moderator(actor, actor_session);
  select * into r from private.reports where id = report;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  select jsonb_build_object('report',to_jsonb(r) || jsonb_build_object('id',r.id::text,'post_id',r.post_id::text,'comment_id',r.comment_id::text),
    'related_reports',coalesce((select jsonb_agg(to_jsonb(page) || jsonb_build_object('id',page.id::text,'post_id',page.post_id::text,'comment_id',page.comment_id::text) order by page.id desc)
      from (select * from private.reports other where other.target_type=r.target_type and
        (other.post_id=r.post_id or other.comment_id=r.comment_id) and (before_report_id is null or other.id<before_report_id) order by other.id desc limit 50) page),'[]'::jsonb),
    'post',case when p.id is null then null else to_jsonb(p) || jsonb_build_object('id',p.id::text) end,
    'comment',case when c.id is null then null else to_jsonb(c) || jsonb_build_object('id',c.id::text,'post_id',c.post_id::text,'parent_id',c.parent_id::text) end,
    -- 신고된 댓글이 답글이면 원 댓글을 함께 보여 준다.
    'parent_comment',case when parent_comment.id is null then null else jsonb_build_object('id',parent_comment.id::text,
      'content',parent_comment.content,'deleted_at',parent_comment.deleted_at,'hidden_at',parent_comment.hidden_at,
      'created_at',parent_comment.created_at) end,
    'products',coalesce((select jsonb_agg(to_jsonb(pp) || jsonb_build_object('post_id',pp.post_id::text) order by pp.position) from private.post_products pp where pp.post_id=p.id),'[]'::jsonb),
    'author',case when profile.id is null then null else jsonb_build_object('id',profile.id,'status',profile.status,'restricted_until',profile.restricted_until) end,
    'sanctions',coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('id',s.id::text,'action_id',s.action_id::text) order by s.id desc)
      from private.user_sanctions s where s.user_id = r.reported_user_id),'[]'::jsonb),
    'actions',coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('id',a.id::text) order by a.id desc)
      from private.admin_actions a where a.report_id = r.id or
        (a.target_type=r.target_type::text and a.target_id=coalesce(r.post_id,r.comment_id)::text) or
        (a.target_type='user' and a.target_id=r.reported_user_id::text)),'[]'::jsonb)
  ) into result from (select 1) seed
    left join private.comments c on c.id=r.comment_id
    left join private.comments parent_comment on parent_comment.id=c.parent_id
    left join private.posts p on p.id=coalesce(r.post_id,c.post_id)
    left join public.profiles profile on profile.id=r.reported_user_id;
  insert into private.admin_access_logs(admin_id,report_id,session_ip,subject_ids)
    values(actor,report,(select s.ip from auth.sessions s where s.id=actor_session and s.user_id=actor),
      (select coalesce(array_agg(distinct subject_id) filter(where subject_id is not null),'{}'::uuid[])
        from (
          select r.reported_user_id as subject_id
          union all select (item->>'reporter_id')::uuid from jsonb_array_elements(result->'related_reports') item
        ) subjects));
  return result;
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
    -- 원 댓글이 빠져 목록에 안 보이는 답글도 신고할 수 없다.
    if not found or comment.author_id is null or not private.community_comment_listed(comment.id) then
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

CREATE INDEX comments_parent_idx ON private.comments USING btree (parent_id, created_at, id)
  WHERE (parent_id IS NOT NULL);
