SET local check_function_bodies = off;

ALTER TABLE "private"."admin_access_logs"
  ADD COLUMN "session_ip" inet;

ALTER TABLE "private"."admin_access_logs"
  ADD COLUMN "subject_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE "private"."admin_console_access_logs"
  ADD COLUMN "session_ip" inet;

ALTER TABLE "private"."admin_console_access_logs"
  ADD COLUMN "subject_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION private.admin_console (
  actor         uuid,
  actor_session uuid,
  resource      text,
  search_query  text    DEFAULT ''::text,
  status_filter text    DEFAULT 'all'::text,
  type_filter   text    DEFAULT 'all'::text,
  page_number   integer DEFAULT 1,
  report_id     bigint  DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result jsonb; detail jsonb; selected_report private.reports%rowtype; viewed_subjects uuid[];
begin
  perform private.assert_moderator(actor,actor_session);
  if resource is null or resource not in ('session','reports','report_detail','members','sanctions') or
    search_query is null or char_length(search_query)>100 or page_number is null or page_number not between 1 and 100000 or
    status_filter is null or status_filter not in ('all','received','reviewing','resolved','rejected') or
    type_filter is null or type_filter not in ('all','post','comment') then
    raise exception 'invalid_console_query' using errcode='22023';
  end if;
  if resource='session' then
    return (select jsonb_build_object('id',a.id,'email',a.email,'role',a.role) from private.admin_users a where a.id=actor);
  end if;
  if resource='report_detail' then
    detail:=private.admin_report_detail(actor,actor_session,report_id);
    select * into selected_report from private.reports where id=report_id;
    return detail || jsonb_build_object(
      'author_name',(select p.nickname from public.profiles p where p.id=selected_report.reported_user_id),
      'group_status',(select case when bool_or(r.status='received') then 'received' when bool_or(r.status='reviewing') then 'reviewing'
        when bool_or(r.status='resolved') then 'resolved' else 'rejected' end from private.reports r
        where r.target_type=selected_report.target_type and (r.post_id=selected_report.post_id or r.comment_id=selected_report.comment_id)),
      'report_count',(select count(*) from private.reports r where r.target_type=selected_report.target_type
        and (r.post_id=selected_report.post_id or r.comment_id=selected_report.comment_id)));
  end if;
  if resource='reports' then
    with grouped as (
      select r.target_type,coalesce(r.post_id,r.comment_id) as target_id,max(r.id) as latest_id,
        max(r.reported_user_id::text) as author_id,count(*) as report_count,
        min(r.created_at) as first_at,max(r.created_at) as latest_at,
        case when bool_or(r.status='received') then 'received' when bool_or(r.status='reviewing') then 'reviewing'
          when bool_or(r.status='resolved') then 'resolved' else 'rejected' end as status,
        jsonb_build_object('abuse',count(*) filter(where r.reason='abuse'),'spam',count(*) filter(where r.reason='spam'),
          'inappropriate',count(*) filter(where r.reason='inappropriate'),'other',count(*) filter(where r.reason='other')) as reasons
      from private.reports r group by r.target_type,r.post_id,r.comment_id
    ), enriched as (
      select g.*,p.nickname,coalesce(c.content,post.content,'삭제된 콘텐츠') as content
      from grouped g left join public.profiles p on p.id::text=g.author_id
      left join private.comments c on g.target_type='comment' and c.id=g.target_id
      left join private.posts post on g.target_type='post' and post.id=g.target_id
    ), filtered as (
      select * from enriched e where (status_filter='all' or e.status=status_filter) and
        (type_filter='all' or e.target_type::text=type_filter) and
        (search_query='' or position(lower(search_query) in lower(concat_ws(' ',e.target_id,e.content,e.nickname,e.author_id)))>0)
    ), page as (select * from filtered order by latest_id desc limit 20 offset (page_number-1)*20)
    select jsonb_build_object('total',(select count(*) from filtered),'counts',
      (select jsonb_build_object('all',count(*),'received',count(*) filter(where status='received'),
        'reviewing',count(*) filter(where status='reviewing'),'resolved',count(*) filter(where status='resolved'),
        'rejected',count(*) filter(where status='rejected')) from grouped),
      'rows',coalesce((select jsonb_agg(jsonb_build_object('id',latest_id::text,'content_id',target_id::text,
        'type',target_type,'author_id',author_id,'author',coalesce(nickname,'탈퇴한 회원'),'content',content,
        'report_count',report_count,'first_at',first_at,'latest_at',latest_at,'status',status,'reasons',reasons) order by latest_id desc) from page),'[]'::jsonb)) into result;
  elsif resource='members' then
    with filtered as (
      select p.id,p.nickname,p.created_at,u.last_sign_in_at,
        case when p.status='community_restricted' and p.restricted_until<=now() then 'active' else p.status::text end as status
      from public.profiles p join auth.users u on u.id=p.id
      where search_query='' or position(lower(search_query) in lower(p.nickname || ' ' || p.id::text))>0
    ), page as (select * from filtered order by created_at desc,id desc limit 20 offset (page_number-1)*20)
    select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'posts',(select count(*) from private.posts x where x.author_id=p.id and x.deleted_at is null),
      'comments',(select count(*) from private.comments x where x.author_id=p.id and x.deleted_at is null),
      'reports',(select count(*) from private.reports x where x.reported_user_id=p.id),
      'sanctions',(select count(*) from private.user_sanctions x where x.user_id=p.id)) order by p.created_at desc,p.id desc) from page p),'[]'::jsonb)) into result;
  else
    with filtered as (
      select s.*,p.nickname,a.reason,a.admin_id,a.report_id,a.target_id,
        case when s.released_at is not null then 'released' when s.kind='community_restricted' and s.restricted_until<=now() then 'expired'
          when s.kind='warning' then 'record' else 'active' end as state
      from private.user_sanctions s left join public.profiles p on p.id=s.user_id join private.admin_actions a on a.id=s.action_id
      where search_query='' or position(lower(search_query) in lower(concat_ws(' ',p.nickname,s.user_id,a.target_id)))>0
    ), page as (select * from filtered order by id desc limit 20 offset (page_number-1)*20)
    select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(p) ||
      jsonb_build_object('id',p.id::text,'action_id',p.action_id::text,'report_id',p.report_id::text) order by p.id desc) from page p),'[]'::jsonb)) into result;
  end if;
  select coalesce(array_agg(distinct subject_id) filter(where subject_id is not null),'{}'::uuid[])
    into viewed_subjects from (
      select (row->>case resource when 'members' then 'id' when 'reports' then 'author_id' else 'user_id' end)::uuid as subject_id
      from jsonb_array_elements(result->'rows') row
    ) subjects;
  insert into private.admin_console_access_logs(admin_id,resource,session_ip,subject_ids)
    values(actor,resource,(select s.ip from auth.sessions s where s.id=actor_session and s.user_id=actor),viewed_subjects);
  return result;
end;
$function$;

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
    'comment',case when c.id is null then null else to_jsonb(c) || jsonb_build_object('id',c.id::text,'post_id',c.post_id::text) end,
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

CREATE OR REPLACE FUNCTION private.reject_public_email_signup (
  event jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select case when coalesce(event->'user'->'app_metadata'->>'provider','email') = 'email'
    then jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Email signup is disabled. Please use social sign-in.'))
    else '{}'::jsonb end;
$function$;

REVOKE ALL ON FUNCTION "private"."reject_public_email_signup"(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."reject_public_email_signup"(jsonb) TO "supabase_auth_admin";

REVOKE ALL ON SCHEMA "private" FROM "supabase_auth_admin";

GRANT USAGE ON SCHEMA "private" TO "supabase_auth_admin";
