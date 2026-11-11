-- RPT-005~006: 앱 테이블을 Retool에 열지 않고, Edge Function 전용 RPC만 제공한다.
create table private.admin_users (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null unique,
  role text not null check (role in ('operator','super_admin')),
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table private.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid not null references private.admin_users(id),
  request_id uuid not null unique,
  action text not null check (action in ('report_status','hide','restore','warning','community_restricted','suspended','release')),
  target_type text not null check (target_type in ('post','comment','user')),
  target_id text not null,
  report_id bigint,
  reason_category public.report_reason not null,
  reason text not null check (private.char_count(reason) between 1 and 1000),
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create table private.user_sanctions (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  action_id bigint not null unique references private.admin_actions(id),
  kind public.account_status not null check (kind in ('warning','community_restricted','suspended')),
  reason_category public.report_reason not null,
  restricted_until timestamptz,
  notice_seen_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'community_restricted') = (restricted_until is not null))
);
create index user_sanctions_user_idx on private.user_sanctions(user_id, id desc);

-- 준비 단계에서는 계정 상태를 바꾸지 않는다. Auth 관리 API의 트랜잭션 안에서
-- 프로필·제재·감사 로그를 함께 확정해 ban 실패 시 부분 적용을 막는다.
create table private.moderation_requests (
  id uuid primary key,
  admin_id uuid not null references private.admin_users(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('warning','community_restricted','suspended','release')),
  reason_category public.report_reason not null,
  reason text not null check (private.char_count(reason) between 1 and 1000),
  report_id bigint,
  state text not null default 'pending' check (state in ('pending','applied','failed')),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  action_id bigint references private.admin_actions(id)
);
create unique index moderation_requests_one_pending_user on private.moderation_requests(user_id) where state = 'pending';
-- 처리방침 제3조 운영자의 개인정보 조회 기록. 신고 상세(작성자 UUID·원문)를 본 운영자와 시각을 남긴다(#164).
create table private.admin_access_logs (
  id bigint generated always as identity primary key,
  admin_id uuid not null references private.admin_users(id),
  report_id bigint not null,
  created_at timestamptz not null default now()
);
create index admin_access_logs_admin_idx on private.admin_access_logs(admin_id);
create index admin_access_logs_created_idx on private.admin_access_logs(created_at);
create index admin_actions_admin_idx on private.admin_actions(admin_id);
create index admin_actions_target_idx on private.admin_actions(target_type,target_id,id desc);
create index admin_actions_report_idx on private.admin_actions(report_id,id desc);
create index moderation_requests_admin_idx on private.moderation_requests(admin_id);
create index moderation_requests_user_idx on private.moderation_requests(user_id);
create index moderation_requests_action_idx on private.moderation_requests(action_id);
alter table private.posts add column hidden_by uuid references private.admin_users(id);
alter table private.comments add column hidden_by uuid references private.admin_users(id);
create index posts_hidden_by_idx on private.posts(hidden_by);
create index comments_hidden_by_idx on private.comments(hidden_by);

alter table private.admin_users enable row level security;
alter table private.admin_actions enable row level security;
alter table private.user_sanctions enable row level security;
alter table private.moderation_requests enable row level security;
alter table private.admin_access_logs enable row level security;
revoke all on private.admin_users, private.admin_actions, private.user_sanctions, private.moderation_requests, private.admin_access_logs from public, anon, authenticated, service_role;
revoke all on sequence private.admin_actions_id_seq, private.user_sanctions_id_seq from public, anon, authenticated, service_role;

create or replace function private.reject_audit_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- private.delete_expired_records()만 보관기간이 지난 기록을 지운다. 앱·service_role은 테이블 권한이 없어 이 설정으로 우회할 수 없다.
  if tg_op = 'DELETE' and current_setting('private.retention_cleanup', true) = 'on' then return old; end if;
  raise exception 'audit_is_append_only' using errcode = '42501';
end;
$$;
create trigger admin_actions_append_only before update or delete on private.admin_actions
for each row execute function private.reject_audit_change();
create trigger admin_actions_no_truncate before truncate on private.admin_actions
for each statement execute function private.reject_audit_change();

-- actor/session은 Edge가 getUser로 검증한 JWT에서만 전달한다.
create or replace function private.assert_moderator(actor uuid, actor_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if actor is null or actor_session is null or not exists (
    select 1 from private.admin_users a join auth.sessions s on s.user_id = a.id
    join auth.users u on u.id = a.id join public.profiles p on p.id=a.id
    where a.id = actor and a.disabled_at is null and a.role in ('operator','super_admin')
      and s.id = actor_session and (s.not_after is null or s.not_after>now())
      and p.status<>'suspended' and (u.banned_until is null or u.banned_until <= now())
  ) then raise exception 'admin_required' using errcode = '42501'; end if;
end;
$$;

create or replace function private.validate_moderation_reason(category text, explanation text)
returns void language plpgsql set search_path = '' as $$
begin
  if category is null or category not in ('abuse','spam','inappropriate','other','underage') or
    explanation is null or explanation !~ '[^[:space:]]' or private.char_count(btrim(explanation)) not between 1 and 1000 then
    raise exception 'invalid_moderation_reason' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.admin_report_groups(actor uuid, actor_session uuid, before_id bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_moderator(actor, actor_session);
  return coalesce((select jsonb_agg(group_row.value order by group_row.latest_id desc) from (
    select max(r.id) as latest_id, jsonb_build_object(
      'target_type',r.target_type,'target_id',coalesce(r.post_id,r.comment_id)::text,
      'latest_report_id',max(r.id)::text,'report_count',count(*),
      'reason_counts',jsonb_build_object('abuse',count(*) filter(where r.reason='abuse'),
        'spam',count(*) filter(where r.reason='spam'),'inappropriate',count(*) filter(where r.reason='inappropriate'),
        'other',count(*) filter(where r.reason='other')),
      'status_counts',jsonb_build_object('received',count(*) filter(where r.status='received'),
        'reviewing',count(*) filter(where r.status='reviewing'),'resolved',count(*) filter(where r.status='resolved'),
        'rejected',count(*) filter(where r.status='rejected')),
      'first_reported_at',min(r.created_at),'last_reported_at',max(r.created_at)
    ) as value from private.reports r group by r.target_type,r.post_id,r.comment_id
    having before_id is null or max(r.id) < before_id order by max(r.id) desc limit 50
  ) group_row),'[]'::jsonb);
end;
$$;

create or replace function private.admin_report_detail(actor uuid, actor_session uuid, report bigint, before_report_id bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
    'products',coalesce((select jsonb_agg(to_jsonb(pp) order by pp.position) from private.post_products pp where pp.post_id=p.id),'[]'::jsonb),
    'author',case when profile.id is null then null else jsonb_build_object('id',profile.id,'status',profile.status,'restricted_until',profile.restricted_until) end,
    'sanctions',coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('id',s.id::text,'action_id',s.action_id::text) order by s.id desc)
      from private.user_sanctions s where s.user_id = r.reported_user_id),'[]'::jsonb),
    'actions',coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('id',a.id::text) order by a.id desc)
      from private.admin_actions a where a.report_id = r.id or (a.target_type='user' and a.target_id=r.reported_user_id::text)),'[]'::jsonb)
  ) into result from (select 1) seed
    left join private.comments c on c.id=r.comment_id
    left join private.posts p on p.id=coalesce(r.post_id,c.post_id)
    left join public.profiles profile on profile.id=r.reported_user_id;
  insert into private.admin_access_logs(admin_id, report_id) values (actor, report);
  return result;
end;
$$;

create or replace function private.admin_content_action(actor uuid, actor_session uuid, request_id uuid,
  report bigint, operation text, new_status text, category text, explanation text)
returns text language plpgsql security definer set search_path = '' as $$
declare r private.reports%rowtype; audit private.admin_actions%rowtype; previous jsonb; next_state jsonb;
  parent_id bigint; removed_at timestamptz; parent_removed timestamptz; hidden timestamptz; hidden_actor uuid; audit_id bigint;
begin
  perform private.assert_moderator(actor, actor_session);
  perform private.validate_moderation_reason(category, explanation);
  -- 만 14세 미만(AUTH-002~004)은 계정 이용 중단 사유라 콘텐츠 조치에는 쓰지 않는다.
  if category='underage' then raise exception 'invalid_moderation_reason' using errcode='22023'; end if;
  if request_id is null or operation is null or operation not in ('report_status','hide','restore') then
    raise exception 'invalid_moderation_action' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,0));
  select * into audit from private.admin_actions where admin_actions.request_id=admin_content_action.request_id;
  if found then
    if audit.admin_id <> actor or audit.report_id is distinct from report or audit.action <> operation or
      audit.reason_category::text <> category or audit.reason <> btrim(explanation) or
      (operation='report_status' and audit.after_state->>'status' is distinct from new_status) then
      raise exception 'request_id_conflict' using errcode='22023'; end if;
    return audit.id::text;
  end if;
  -- 원본 콘텐츠를 먼저 잠근다. 신고 생성·댓글 편집과 같은 순서다.
  select * into r from private.reports where id=report;
  if not found then raise exception 'report_not_found' using errcode='P0002'; end if;
  if operation='report_status' then
    select * into r from private.reports where id=report for update;
    if not found then raise exception 'report_not_found' using errcode='P0002'; end if;
    if new_status is null or not ((r.status='received' and new_status='reviewing') or
      (r.status='reviewing' and new_status in ('resolved','rejected'))) then
      raise exception 'invalid_report_transition' using errcode='22023'; end if;
    previous := jsonb_build_object('status',r.status);
    update private.reports set status=new_status::public.report_status,updated_at=now() where id=report;
    next_state := jsonb_build_object('status',new_status);
  else
    if r.target_type='post' then parent_id:=r.post_id;
    else select post_id into parent_id from private.comments where id=r.comment_id; end if;
    select deleted_at into parent_removed from private.posts where id=parent_id for update;
    if not found then raise exception 'content_not_found' using errcode='P0002'; end if;
    if parent_removed is not null then raise exception 'deleted_content_cannot_change' using errcode='22023'; end if;
    if r.target_type='post' then
      select deleted_at,hidden_at,hidden_by into removed_at,hidden,hidden_actor from private.posts where id=parent_id;
    else
      select deleted_at,hidden_at,hidden_by into removed_at,hidden,hidden_actor from private.comments where id=r.comment_id for update;
    end if;
    if removed_at is not null then raise exception 'deleted_content_cannot_change' using errcode='22023'; end if;
    if (operation='hide' and hidden is not null) or (operation='restore' and hidden is null) then
      raise exception 'content_state_conflict' using errcode='22023'; end if;
    previous := jsonb_build_object('hidden_at',hidden,'hidden_by',hidden_actor);
    next_state := jsonb_build_object('hidden_at',case when operation='hide' then now() else null end,'hidden_by',case when operation='hide' then actor else null end);
    if r.target_type='post' then
      update private.posts set hidden_at=case when operation='hide' then now() else null end,
        hidden_by=case when operation='hide' then actor else null end where id=parent_id;
    else
      update private.comments set hidden_at=case when operation='hide' then now() else null end,
        hidden_by=case when operation='hide' then actor else null end where id=r.comment_id;
    end if;
  end if;
  insert into private.admin_actions(admin_id,request_id,action,target_type,target_id,report_id,reason_category,reason,before_state,after_state)
    values(actor,request_id,operation,r.target_type::text,coalesce(r.post_id,r.comment_id)::text,report,
      category::public.report_reason,btrim(explanation),previous,next_state) returning id into audit_id;
  return audit_id::text;
end;
$$;

create or replace function private.admin_prepare_sanction(actor uuid, actor_session uuid, request_id uuid,
  target_user uuid, operation text, category text, explanation text, report bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved private.moderation_requests%rowtype; profile public.profiles%rowtype;
begin
  perform private.assert_moderator(actor,actor_session);
  perform private.validate_moderation_reason(category,explanation);
  if request_id is null or operation is null or operation not in ('warning','community_restricted','suspended','release') or
    target_user is null or target_user=actor then raise exception 'invalid_sanction' using errcode='22023'; end if;
  if category='underage' and operation not in ('suspended','release') then
    raise exception 'invalid_moderation_reason' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,0));
  select * into saved from private.moderation_requests where id=request_id;
  if found then
    if saved.admin_id<>actor or saved.user_id<>target_user or saved.action<>operation or
      saved.reason_category::text<>category or saved.reason<>btrim(explanation) or saved.report_id is distinct from report then
      raise exception 'request_id_conflict' using errcode='22023'; end if;
    if saved.state='failed' then raise exception 'request_failed_use_new_id' using errcode='22023'; end if;
    return to_jsonb(saved) || jsonb_build_object('action_id',saved.action_id::text);
  end if;
  select * into profile from public.profiles where id=target_user for update;
  if not found then raise exception 'user_not_found' using errcode='P0002'; end if;
  if exists(select 1 from private.admin_users where id=target_user and disabled_at is null) then
    raise exception 'cannot_sanction_admin' using errcode='22023'; end if;
  -- 자동 삭제가 시작된 계정을 해제하면 복구한 계정이 지워진다. 한 시간이 지난 중단 작업만 다시 해제할 수 있다.
  if operation='release' and exists(select 1 from private.underage_deletion_claims
    where user_id=target_user and claimed_at > now() - interval '1 hour') then
    raise exception 'account_deletion_in_progress' using errcode='55000'; end if;
  if (profile.status='suspended' and operation<>'release') or (profile.status='active' and operation='release') then
    raise exception 'sanction_state_conflict' using errcode='22023'; end if;
  if report is not null and not exists(select 1 from private.reports where id=report and reported_user_id=target_user) then
    raise exception 'invalid_sanction_report' using errcode='22023'; end if;
  if exists(select 1 from private.moderation_requests where user_id=target_user and state='pending') then
    raise exception 'sanction_request_pending' using errcode='55000'; end if;
  insert into private.moderation_requests(id,admin_id,user_id,action,reason_category,reason,report_id)
    values(request_id,actor,target_user,operation,category::public.report_reason,btrim(explanation),report) returning * into saved;
  return to_jsonb(saved);
end;
$$;

create or replace function private.apply_auth_moderation()
returns trigger language plpgsql security definer set search_path = '' as $$
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
  previous := jsonb_build_object('status',profile.status,'restricted_until',profile.restricted_until,'suspended_at',profile.suspended_at);
  next_state := jsonb_build_object('status',next_status,'restricted_until',until_time,'suspended_at',case when next_status='suspended' then now() else null end);
  update public.profiles set status=next_status,restricted_until=until_time,
    suspended_at=case when next_status='suspended' then now() else null end where id=new.id;
  if next_status='suspended' then
    -- Auth 세션 삭제는 같은 트랜잭션에 포함한다. 미만료 JWT는 아래 API 가드로 막는다.
    delete from auth.sessions where user_id=new.id;
  end if;
  update private.user_sanctions set released_at=now() where user_id=new.id and released_at is null;
  insert into private.admin_actions(admin_id,request_id,action,target_type,target_id,report_id,reason_category,reason,before_state,after_state)
    values(pending.admin_id,pending.id,pending.action,'user',new.id::text,pending.report_id,pending.reason_category,pending.reason,previous,next_state)
    returning id into audit_id;
  if next_status<>'active' then
    insert into private.user_sanctions(user_id,action_id,kind,reason_category,restricted_until)
      values(new.id,audit_id,next_status,pending.reason_category,until_time);
  end if;
  update private.moderation_requests set state='applied',applied_at=now(),action_id=audit_id where id=pending.id;
  return new;
end;
$$;
create constraint trigger on_auth_moderation_updated after update on auth.users deferrable initially deferred
for each row execute function private.apply_auth_moderation();

create or replace function private.admin_sanction_request(actor uuid, actor_session uuid, request_id uuid, mark_failed boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved private.moderation_requests%rowtype;
begin
  perform private.assert_moderator(actor,actor_session);
  select * into saved from private.moderation_requests where id=request_id and admin_id=actor for update;
  if not found then raise exception 'request_not_found' using errcode='P0002'; end if;
  if mark_failed and saved.state='pending' then
    update private.moderation_requests set state='failed' where id=saved.id returning * into saved;
  end if;
  return to_jsonb(saved) || jsonb_build_object('action_id',saved.action_id::text);
end;
$$;

-- 만료된 JWT로는 호출할 수 없다. 세션 종료 직전 본인 JWT로 제재 안내만 읽는다.
create or replace function private.get_account_access()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare viewer uuid:=(select auth.uid()); profile public.profiles%rowtype; sanction private.user_sanctions%rowtype;
begin
  if viewer is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into profile from public.profiles where id=viewer;
  if not found then raise exception 'not_authorized' using errcode='42501'; end if;
  select * into sanction from private.user_sanctions where user_id=viewer and released_at is null order by id desc limit 1;
  return jsonb_build_object('status',case when profile.status='community_restricted' and profile.restricted_until<=now()
    then 'active'::public.account_status else profile.status end,'restricted_until',profile.restricted_until,
    'sanction_id',sanction.id::text,'reason_category',sanction.reason_category,'notice_seen_at',sanction.notice_seen_at);
end;
$$;
create or replace function private.acknowledge_sanction_notice(sanction_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  update private.user_sanctions set notice_seen_at=coalesce(notice_seen_at,now())
    where id=sanction_id and user_id=(select auth.uid()) and released_at is null and kind in ('warning','community_restricted');
  if not found then raise exception 'sanction_not_found' using errcode='42501'; end if;
end;
$$;

create or replace function public.get_account_access()
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.get_account_access(); $$;
create or replace function public.acknowledge_sanction_notice(sanction_id bigint)
returns void language sql security invoker set search_path = '' as $$ select private.acknowledge_sanction_notice(sanction_id); $$;

create or replace function public.admin_report_groups(actor uuid, actor_session uuid, before_id bigint default null)
returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_report_groups(actor,actor_session,before_id); $$;
create or replace function public.admin_report_detail(actor uuid, actor_session uuid, report bigint, before_report_id bigint default null)
returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_report_detail(actor,actor_session,report,before_report_id); $$;
create or replace function public.admin_content_action(actor uuid, actor_session uuid, request_id uuid, report bigint, operation text, new_status text, category text, explanation text)
returns text language sql security invoker set search_path = '' as $$ select private.admin_content_action(actor,actor_session,request_id,report,operation,new_status,category,explanation); $$;
create or replace function public.admin_prepare_sanction(actor uuid, actor_session uuid, request_id uuid, target_user uuid, operation text, category text, explanation text, report bigint default null)
returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_prepare_sanction(actor,actor_session,request_id,target_user,operation,category,explanation,report); $$;
create or replace function public.admin_sanction_request(actor uuid, actor_session uuid, request_id uuid, mark_failed boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_sanction_request(actor,actor_session,request_id,mark_failed); $$;

revoke execute on function private.reject_audit_change(),private.assert_moderator(uuid,uuid),private.validate_moderation_reason(text,text),private.apply_auth_moderation() from public,anon,authenticated,service_role;
revoke execute on function private.get_account_access(),public.get_account_access(),private.acknowledge_sanction_notice(bigint),public.acknowledge_sanction_notice(bigint) from public,anon;
grant execute on function private.get_account_access(),public.get_account_access(),private.acknowledge_sanction_notice(bigint),public.acknowledge_sanction_notice(bigint) to authenticated;
grant usage on schema private to service_role;
revoke execute on function private.admin_report_groups(uuid,uuid,bigint),public.admin_report_groups(uuid,uuid,bigint),
  private.admin_report_detail(uuid,uuid,bigint,bigint),public.admin_report_detail(uuid,uuid,bigint,bigint),
  private.admin_content_action(uuid,uuid,uuid,bigint,text,text,text,text),public.admin_content_action(uuid,uuid,uuid,bigint,text,text,text,text),
  private.admin_prepare_sanction(uuid,uuid,uuid,uuid,text,text,text,bigint),public.admin_prepare_sanction(uuid,uuid,uuid,uuid,text,text,text,bigint),
  private.admin_sanction_request(uuid,uuid,uuid,boolean),public.admin_sanction_request(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function private.admin_report_groups(uuid,uuid,bigint),public.admin_report_groups(uuid,uuid,bigint),
  private.admin_report_detail(uuid,uuid,bigint,bigint),public.admin_report_detail(uuid,uuid,bigint,bigint),
  private.admin_content_action(uuid,uuid,uuid,bigint,text,text,text,text),public.admin_content_action(uuid,uuid,uuid,bigint,text,text,text,text),
  private.admin_prepare_sanction(uuid,uuid,uuid,uuid,text,text,text,bigint),public.admin_prepare_sanction(uuid,uuid,uuid,uuid,text,text,text,bigint),
  private.admin_sanction_request(uuid,uuid,uuid,boolean),public.admin_sanction_request(uuid,uuid,uuid,boolean) to service_role;

create or replace function private.account_is_active()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare viewer uuid:=(select auth.uid()); session_text text:=(select auth.jwt()->>'session_id');
begin
  return exists(select 1 from public.profiles where id=viewer and status<>'suspended') and
    (session_text is null or exists(select 1 from auth.sessions where id=session_text::uuid and user_id=viewer));
end;
$$;
create or replace function private.assert_account_access()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if exists(select 1 from public.profiles where id=(select auth.uid()) and status='suspended') then
    raise exception 'suspended' using errcode='42501',detail=private.get_account_access()::text;
  end if;
  if not private.account_is_active() then raise exception 'not_authorized' using errcode='42501'; end if;
end;
$$;
revoke execute on function private.account_is_active(),private.assert_account_access() from public,anon;
grant execute on function private.account_is_active(),private.assert_account_access() to authenticated;

-- 미만료 access token이 남아도 본인 안내 RPC 외에는 이용을 막는다.
create policy "profiles_active_account" on public.profiles as restrictive to authenticated
  using ((select private.account_is_active())) with check ((select private.account_is_active()));
create policy "products_active_account" on public.products as restrictive to authenticated
  using ((select private.account_is_active())) with check ((select private.account_is_active()));
create policy "folders_active_account" on public.folders as restrictive to authenticated
  using ((select private.account_is_active())) with check ((select private.account_is_active()));
create policy "product_folders_active_account" on public.product_folders as restrictive to authenticated
  using ((select private.account_is_active())) with check ((select private.account_is_active()));
create policy "push_tokens_active_account" on public.push_tokens as restrictive to authenticated
  using ((select private.account_is_active())) with check ((select private.account_is_active()));
create policy "consents_active_account" on private.user_policy_consents as restrictive to authenticated
  using ((select private.account_is_active())) with check ((select private.account_is_active()));
create policy "imports_active_account" on public.import_jobs as restrictive to authenticated
  using ((select private.account_is_active())) with check ((select private.account_is_active()));
create policy "import_failures_active_account" on public.import_failures as restrictive to authenticated
  using ((select private.account_is_active())) with check ((select private.account_is_active()));
create policy "avatars_active_account" on storage.objects as restrictive to authenticated
  using ((select private.account_is_active())) with check ((select private.account_is_active()));

-- 제공자 서명·audience를 검증한 Edge만 호출한다. UUID·이메일 조회 API는 열지 않는다.
create or replace function private.lookup_suspended_identity(identity_provider text, identity_subject text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status','suspended','sanction_id',s.id::text,'reason_category',s.reason_category)
  from auth.identities i join public.profiles p on p.id=i.user_id
  join lateral (select * from private.user_sanctions where user_id=p.id and kind='suspended' and released_at is null order by id desc limit 1) s on true
  where i.provider=identity_provider and i.provider_id=identity_subject and p.status='suspended';
$$;
create or replace function public.lookup_suspended_identity(identity_provider text, identity_subject text)
returns jsonb language sql security invoker set search_path = '' as $$ select private.lookup_suspended_identity(identity_provider,identity_subject); $$;
revoke execute on function private.lookup_suspended_identity(text,text),public.lookup_suspended_identity(text,text) from public,anon,authenticated;
grant execute on function private.lookup_suspended_identity(text,text),public.lookup_suspended_identity(text,text) to service_role;
