-- 관리자 웹 조회. 브라우저에는 private 테이블 권한을 주지 않는다.
create table private.admin_console_access_logs (
  id bigint generated always as identity primary key,
  admin_id uuid not null references private.admin_users(id),
  resource text not null check (resource in ('reports','members','sanctions')),
  created_at timestamptz not null default now()
);
create index admin_console_access_logs_admin_idx on private.admin_console_access_logs(admin_id);
create index admin_console_access_logs_created_idx on private.admin_console_access_logs(created_at);
alter table private.admin_console_access_logs enable row level security;
revoke all on private.admin_console_access_logs from public,anon,authenticated,service_role;
revoke all on sequence private.admin_console_access_logs_id_seq from public,anon,authenticated,service_role;

create or replace function private.admin_console(actor uuid, actor_session uuid, resource text,
  search_query text default '', status_filter text default 'all', type_filter text default 'all',
  page_number integer default 1, report_id bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; detail jsonb; selected_report private.reports%rowtype;
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
  insert into private.admin_console_access_logs(admin_id,resource) values(actor,resource);
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
  return result;
end;
$$;

-- 콘텐츠별 상태 변경은 한 트랜잭션으로 처리한다. 완료된 개별 신고는 보존한다.
create or replace function private.admin_report_group_status(actor uuid, actor_session uuid, request_id uuid,
  report bigint, new_status text, category text, explanation text)
returns text language plpgsql security definer set search_path = '' as $$
declare selected_report private.reports%rowtype; audit private.admin_actions%rowtype; audit_id bigint; before_counts jsonb;
begin
  perform private.assert_moderator(actor,actor_session);
  perform private.validate_moderation_reason(category,explanation);
  if request_id is null or category='underage' or new_status is null or new_status not in ('reviewing','resolved','rejected') then
    raise exception 'invalid_report_transition' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,0));
  select * into audit from private.admin_actions a where a.request_id=admin_report_group_status.request_id;
  if found then
    if audit.admin_id<>actor or audit.report_id is distinct from report or audit.action<>'report_status' or
      audit.after_state->>'group_status' is distinct from new_status or audit.reason_category::text<>category or audit.reason<>btrim(explanation) then
      raise exception 'request_id_conflict' using errcode='22023'; end if;
    return audit.id::text;
  end if;
  select * into selected_report from private.reports where id=report;
  if not found then raise exception 'report_not_found' using errcode='P0002'; end if;
  perform 1 from private.reports r where r.target_type=selected_report.target_type and
    (r.post_id=selected_report.post_id or r.comment_id=selected_report.comment_id) order by r.id for update;
  if not exists(select 1 from private.reports r where r.target_type=selected_report.target_type and
    (r.post_id=selected_report.post_id or r.comment_id=selected_report.comment_id) and r.status=case when new_status='reviewing' then 'received'::public.report_status else 'reviewing'::public.report_status end) or
    (new_status<>'reviewing' and exists(select 1 from private.reports r where r.target_type=selected_report.target_type and
      (r.post_id=selected_report.post_id or r.comment_id=selected_report.comment_id) and r.status='received')) then
    raise exception 'report_state_conflict' using errcode='22023'; end if;
  select jsonb_build_object('received',count(*) filter(where r.status='received'),'reviewing',count(*) filter(where r.status='reviewing'))
    into before_counts from private.reports r where r.target_type=selected_report.target_type and
      (r.post_id=selected_report.post_id or r.comment_id=selected_report.comment_id);
  update private.reports r set status=new_status::public.report_status,updated_at=now()
    where r.target_type=selected_report.target_type and (r.post_id=selected_report.post_id or r.comment_id=selected_report.comment_id)
      and r.status=case when new_status='reviewing' then 'received'::public.report_status else 'reviewing'::public.report_status end;
  insert into private.admin_actions(admin_id,request_id,action,target_type,target_id,report_id,reason_category,reason,before_state,after_state)
    values(actor,request_id,'report_status',selected_report.target_type::text,coalesce(selected_report.post_id,selected_report.comment_id)::text,report,
      category::public.report_reason,btrim(explanation),before_counts,jsonb_build_object('group_status',new_status)) returning id into audit_id;
  return audit_id::text;
end;
$$;

create or replace function public.admin_console(actor uuid,actor_session uuid,resource text,search_query text default '',
  status_filter text default 'all',type_filter text default 'all',page_number integer default 1,report_id bigint default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_console(actor,actor_session,resource,search_query,status_filter,type_filter,page_number,report_id); $$;
create or replace function public.admin_report_group_status(actor uuid,actor_session uuid,request_id uuid,report bigint,new_status text,category text,explanation text)
returns text language sql security invoker set search_path = '' as $$
  select private.admin_report_group_status(actor,actor_session,request_id,report,new_status,category,explanation); $$;
revoke execute on function private.admin_console(uuid,uuid,text,text,text,text,integer,bigint),public.admin_console(uuid,uuid,text,text,text,text,integer,bigint),
  private.admin_report_group_status(uuid,uuid,uuid,bigint,text,text,text),public.admin_report_group_status(uuid,uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function private.admin_console(uuid,uuid,text,text,text,text,integer,bigint),public.admin_console(uuid,uuid,text,text,text,text,integer,bigint),
  private.admin_report_group_status(uuid,uuid,uuid,bigint,text,text,text),public.admin_report_group_status(uuid,uuid,uuid,bigint,text,text,text) to service_role;
