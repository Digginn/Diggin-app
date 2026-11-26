SET local check_function_bodies = off;

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
    -- 회원 관리·제재 이력은 한 화면에 8개씩 보여 준다(#235).
    ), page as (select * from filtered order by created_at desc,id desc limit 8 offset (page_number-1)*8)
    select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'posts',(select count(*) from private.posts x where x.author_id=p.id and x.deleted_at is null),
      'comments',(select count(*) from private.comments x where x.author_id=p.id and x.deleted_at is null),
      'reports',(select count(*) from private.reports x where x.reported_user_id=p.id),
      'sanctions',(select count(*) from private.user_sanctions x where x.user_id=p.id)) order by p.created_at desc,p.id desc) from page p),'[]'::jsonb)) into result;
  else
    with filtered as (
      select s.*,p.nickname,a.reason,a.admin_id,a.report_id,a.target_id,
        case when s.released_at is not null then 'released' when s.kind='community_restricted' and s.restricted_until<=now() then 'expired'
          when s.kind='warning' then 'record' else 'active' end as state,
        -- 제재 이력 화면의 보관 열과 처리 열(#235). 해제는 같은 트랜잭션의 조치 기록이 released_at과 같은 시각을 가진다.
        exists(select 1 from private.retention_holds h where h.target_type='sanction' and h.target_id=s.id) as is_held,
        coalesce((select ru.email from private.admin_actions r join private.admin_users ru on ru.id=r.admin_id
            -- 탈퇴하면 user_id가 비워지므로 남아 있는 제재 조치의 대상 ID로 해제 조치를 찾는다.
            where s.released_at is not null and r.action='release' and r.target_type='user' and r.target_id=a.target_id and r.created_at=s.released_at
            order by r.id limit 1),
          (select au.email from private.admin_users au where au.id=a.admin_id)) as handled_by
      from private.user_sanctions s left join public.profiles p on p.id=s.user_id join private.admin_actions a on a.id=s.action_id
      where search_query='' or position(lower(search_query) in lower(concat_ws(' ',p.nickname,s.user_id,a.target_id)))>0
    ), page as (select * from filtered order by id desc limit 8 offset (page_number-1)*8)
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

CREATE OR REPLACE FUNCTION private.apply_auth_moderation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare request_text text := new.raw_app_meta_data->>'moderation_request_id';
  pending private.moderation_requests%rowtype; profile public.profiles%rowtype;
  next_status public.account_status; until_time timestamptz; audit_id bigint; previous jsonb; next_state jsonb;
begin
  if request_text is null then return new; end if;
  -- Auth는 app_metadata와 ban을 같은 트랜잭션의 별도 UPDATE로 저장한다.
  -- 지연 트리거에서 최종 행을 읽어 둘 다 성공한 경우에만 확정한다.
  select banned_until into new.banned_until from auth.users where id=new.id;
  -- 사용자 수정 가능한 user_metadata는 보지 않는다. Auth 관리자 API의 app_metadata만 사용한다.
  select * into pending from private.moderation_requests where id=request_text::uuid and user_id=new.id for update;
  if not found or pending.state='applied' then return new; end if;
  if pending.state<>'pending' or not exists(select 1 from private.admin_users where id=pending.admin_id and disabled_at is null) then
    raise exception 'invalid_moderation_request'; end if;
  select * into profile from public.profiles where id=new.id for update;
  if not found then raise exception 'user_not_found'; end if;
  if pending.action='suspended' and (new.banned_until is null or new.banned_until <= now()) then
    raise exception 'auth_ban_required'; end if;
  if pending.action='release' and new.banned_until > now() then raise exception 'auth_unban_required'; end if;
  next_status := case when pending.action='release' then 'active'::public.account_status else pending.action::public.account_status end;
  if next_status='community_restricted' then until_time := now() + interval '168 hours'; end if;
  -- 진행 중인 7일 제한은 경고로 풀지 않는다. 경고는 기록만 남기고 계정은 제한 종료일까지 그대로 둔다.
  if next_status='warning' and profile.status='community_restricted' and profile.restricted_until > now() then
    next_status := 'community_restricted'; until_time := profile.restricted_until;
  end if;
  previous := jsonb_build_object('status',profile.status,'restricted_until',profile.restricted_until,'suspended_at',profile.suspended_at);
  next_state := jsonb_build_object('status',next_status,'restricted_until',until_time,'suspended_at',case when next_status='suspended' then now() else null end);
  update public.profiles set status=next_status,restricted_until=until_time,
    suspended_at=case when next_status='suspended' then now() else null end where id=new.id;
  if next_status='suspended' then
    -- Auth 세션 삭제는 같은 트랜잭션에 포함한다. 미만료 JWT는 아래 API 가드로 막는다.
    delete from auth.sessions where user_id=new.id;
  end if;
  -- 운영자가 직접 해제할 때만 해제로 기록한다. 새 제재는 이전 제재를 해제하지 않고, 이미 끝난 7일 제한도 해제하지 않는다.
  if pending.action='release' then
    update private.user_sanctions set released_at=now() where user_id=new.id and released_at is null
      and (kind<>'community_restricted' or restricted_until > now());
  end if;
  insert into private.admin_actions(admin_id,request_id,action,target_type,target_id,report_id,reason_category,reason,before_state,after_state)
    values(pending.admin_id,pending.id,pending.action,'user',new.id::text,pending.report_id,pending.reason_category,pending.reason,previous,next_state)
    returning id into audit_id;
  -- 제재 기록은 계정 상태가 아니라 운영자가 준 제재 종류로 남긴다.
  if pending.action<>'release' then
    insert into private.user_sanctions(user_id,action_id,kind,reason_category,restricted_until)
      values(new.id,audit_id,pending.action::public.account_status,pending.reason_category,
        case when pending.action='community_restricted' then until_time end);
  end if;
  update private.moderation_requests set state='applied',applied_at=now(),action_id=audit_id where id=pending.id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_account_access()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare viewer uuid:=(select auth.uid()); profile public.profiles%rowtype; sanction private.user_sanctions%rowtype;
  effective public.account_status;
begin
  if viewer is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into profile from public.profiles where id=viewer;
  if not found then raise exception 'not_authorized' using errcode='42501'; end if;
  effective := profile.status;
  -- 7일 제한이 끝나면 일반 상태다. 제한 중에 받은 경고 안내를 아직 안 봤으면 그때 경고로 안내한다.
  if profile.status='community_restricted' and profile.restricted_until<=now() then
    effective := case when exists(select 1 from private.user_sanctions where user_id=viewer and kind='warning'
      and released_at is null and notice_seen_at is null) then 'warning'::public.account_status else 'active'::public.account_status end;
  end if;
  -- 이전 제재가 해제되지 않고 남으므로 지금 상태에 해당하는 제재의 안내 정보를 준다.
  select * into sanction from private.user_sanctions where user_id=viewer and released_at is null
    and kind=effective order by id desc limit 1;
  return jsonb_build_object('status',effective,'restricted_until',profile.restricted_until,
    'sanction_id',sanction.id::text,'reason_category',sanction.reason_category,'notice_seen_at',sanction.notice_seen_at);
end;
$function$;

-- 새 제재 때문에 자동으로 해제 처리됐던 이전 제재를 되돌린다. 운영자가 직접 해제한 기록(release 조치)은 그대로 둔다.
-- 기간이 남은 7일 제한은 되돌리면 실제 계정 상태와 달라져 여기서 건드리지 않는다.
update private.user_sanctions s set released_at = null
from private.admin_actions a
where a.id = s.action_id and s.released_at is not null
  and (s.kind = 'warning' or (s.kind = 'community_restricted' and s.restricted_until <= now()))
  and not exists (
    select 1 from private.admin_actions r
    where r.action = 'release' and r.target_type = 'user' and r.target_id = a.target_id and r.created_at = s.released_at
  );
