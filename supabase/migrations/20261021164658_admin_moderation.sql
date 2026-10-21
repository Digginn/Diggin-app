SET local check_function_bodies = off;

CREATE TABLE "private"."admin_actions" (
  "id"              bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "admin_id"        uuid                     NOT NULL,
  "request_id"      uuid                     NOT NULL,
  "action"          text                     NOT NULL,
  "target_type"     text                     NOT NULL,
  "target_id"       text                     NOT NULL,
  "report_id"       bigint,
  "reason_category" public.report_reason     NOT NULL,
  "reason"          text                     NOT NULL,
  "before_state"    jsonb                    NOT NULL,
  "after_state"     jsonb                    NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "admin_actions_action_check"
    CHECK ((action = ANY (ARRAY['report_status'::text, 'hide'::text, 'restore'::text, 'warning'::text, 'community_restricted'::text, 'suspended'::text, 'release'::text]))),
  CONSTRAINT "admin_actions_pkey" PRIMARY KEY (id),
  CONSTRAINT "admin_actions_request_id_key" UNIQUE (request_id),
  CONSTRAINT "admin_actions_target_type_check" CHECK ((target_type = ANY (ARRAY['post'::text, 'comment'::text, 'user'::text]))),
  CONSTRAINT "admin_actions_reason_check" CHECK (((private.char_count(reason) >= 1) AND (private.char_count(reason) <= 1000)))
);

ALTER TABLE "private"."admin_actions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."admin_users" (
  "id"          uuid                     NOT NULL,
  "email"       text                     NOT NULL,
  "role"        text                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "disabled_at" timestamp with time zone,
  CONSTRAINT "admin_users_email_key" UNIQUE (email),
  CONSTRAINT "admin_users_pkey" PRIMARY KEY (id),
  CONSTRAINT "admin_users_role_check" CHECK ((role = ANY (ARRAY['operator'::text, 'super_admin'::text])))
);

ALTER TABLE "private"."admin_users"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."moderation_requests" (
  "id"              uuid                     NOT NULL,
  "admin_id"        uuid                     NOT NULL,
  "user_id"         uuid                     NOT NULL,
  "action"          text                     NOT NULL,
  "reason_category" public.report_reason     NOT NULL,
  "reason"          text                     NOT NULL,
  "report_id"       bigint,
  "state"           text                     NOT NULL DEFAULT 'pending'::text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "applied_at"      timestamp with time zone,
  "action_id"       bigint,
  CONSTRAINT "moderation_requests_action_check" CHECK ((action = ANY (ARRAY['warning'::text, 'community_restricted'::text, 'suspended'::text, 'release'::text]))),
  CONSTRAINT "moderation_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "moderation_requests_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'applied'::text, 'failed'::text]))),
  CONSTRAINT "moderation_requests_reason_check" CHECK (((private.char_count(reason) >= 1) AND (private.char_count(reason) <= 1000)))
);

ALTER TABLE "private"."moderation_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."user_sanctions" (
  "id"               bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id"          uuid,
  "action_id"        bigint                   NOT NULL,
  "kind"             public.account_status    NOT NULL,
  "reason_category"  public.report_reason     NOT NULL,
  "restricted_until" timestamp with time zone,
  "notice_seen_at"   timestamp with time zone,
  "released_at"      timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_sanctions_action_id_key" UNIQUE (action_id),
  CONSTRAINT "user_sanctions_check" CHECK (((kind = 'community_restricted'::public.account_status) = (restricted_until IS NOT NULL))),
  CONSTRAINT "user_sanctions_kind_check"
    CHECK ((kind = ANY (ARRAY['warning'::public.account_status, 'community_restricted'::public.account_status, 'suspended'::public.account_status]))),
  CONSTRAINT "user_sanctions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."user_sanctions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."comments"
  ADD COLUMN "hidden_by" uuid;

ALTER TABLE "private"."posts"
  ADD COLUMN "hidden_by" uuid;

CREATE OR REPLACE FUNCTION private.accept_policy (
  target_policy_id bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.legal_policies where id = target_policy_id and effective_at <= now()
  ) then
    raise exception 'policy_not_effective' using errcode = '22023';
  end if;

  insert into private.user_policy_consents (user_id, policy_id)
  values (current_user_id, target_policy_id)
  on conflict do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION private.account_is_active()
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare viewer uuid:=(select auth.uid()); session_text text:=(select auth.jwt()->>'session_id');
begin
  return exists(select 1 from public.profiles where id=viewer and status<>'suspended') and
    (session_text is null or exists(select 1 from auth.sessions where id=session_text::uuid and user_id=viewer));
end;
$function$;

CREATE OR REPLACE FUNCTION private.acknowledge_sanction_notice (
  sanction_id bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  update private.user_sanctions set notice_seen_at=coalesce(notice_seen_at,now())
    where id=sanction_id and user_id=(select auth.uid()) and released_at is null and kind in ('warning','community_restricted');
  if not found then raise exception 'sanction_not_found' using errcode='42501'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.admin_content_action (
  actor         uuid,
  actor_session uuid,
  request_id    uuid,
  report        bigint,
  operation     text,
  new_status    text,
  category      text,
  explanation   text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r private.reports%rowtype; audit private.admin_actions%rowtype; previous jsonb; next_state jsonb;
  parent_id bigint; removed_at timestamptz; parent_removed timestamptz; hidden timestamptz; hidden_actor uuid; audit_id bigint;
begin
  perform private.assert_moderator(actor, actor_session);
  perform private.validate_moderation_reason(category, explanation);
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
$function$;

CREATE OR REPLACE FUNCTION private.admin_prepare_sanction (
  actor         uuid,
  actor_session uuid,
  request_id    uuid,
  target_user   uuid,
  operation     text,
  category      text,
  explanation   text,
  report        bigint DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare saved private.moderation_requests%rowtype; profile public.profiles%rowtype;
begin
  perform private.assert_moderator(actor,actor_session);
  perform private.validate_moderation_reason(category,explanation);
  if request_id is null or operation is null or operation not in ('warning','community_restricted','suspended','release') or
    target_user is null or target_user=actor then raise exception 'invalid_sanction' using errcode='22023'; end if;
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
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.admin_report_groups (
  actor         uuid,
  actor_session uuid,
  before_id     bigint DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.admin_sanction_request (
  actor         uuid,
  actor_session uuid,
  request_id    uuid,
  mark_failed   boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.assert_account_access()
  RETURNS void
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if exists(select 1 from public.profiles where id=(select auth.uid()) and status='suspended') then
    raise exception 'suspended' using errcode='42501',detail=private.get_account_access()::text;
  end if;
  if not private.account_is_active() then raise exception 'not_authorized' using errcode='42501'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.assert_can_report_community()
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  perform private.assert_account_access();
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and status <> 'suspended') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.assert_can_write_community()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare profile public.profiles%rowtype;
begin
  perform private.assert_account_access();
  select * into profile from public.profiles where id=(select auth.uid()) for update;
  if profile.status='community_restricted' and profile.restricted_until>now() then
    raise exception 'community_restricted' using errcode='42501',
      detail=jsonb_build_object('restricted_until',profile.restricted_until)::text;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.assert_moderator (
  actor         uuid,
  actor_session uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if actor is null or actor_session is null or not exists (
    select 1 from private.admin_users a join auth.sessions s on s.user_id = a.id
    join auth.users u on u.id = a.id join public.profiles p on p.id=a.id
    where a.id = actor and a.disabled_at is null and a.role in ('operator','super_admin')
      and s.id = actor_session and (s.not_after is null or s.not_after>now())
      and p.status<>'suspended' and (u.banned_until is null or u.banned_until <= now())
  ) then raise exception 'admin_required' using errcode = '42501'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.delete_community_post (
  target_post_id bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer_id uuid := (select auth.uid());
  target private.posts%rowtype;
begin
  if viewer_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform private.assert_can_write_community();
  -- RPT-006: 기간 제한 중에는 본인 게시글 삭제도 차단한다.
  select * into target from private.posts where id = target_post_id and author_id = viewer_id for update;
  if not found then raise exception 'post_not_found' using errcode = '42501'; end if;
  if target.deleted_at is not null then return; end if;
  update private.posts set deleted_at = now() where id = target.id;
  update private.comments set deleted_at = now() where post_id = target.id and deleted_at is null;
  if target.type = 'vote' then delete from private.vote_responses where post_id = target.id; end if;
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
begin
  if viewer is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into profile from public.profiles where id=viewer;
  if not found then raise exception 'not_authorized' using errcode='42501'; end if;
  select * into sanction from private.user_sanctions where user_id=viewer and released_at is null order by id desc limit 1;
  return jsonb_build_object('status',case when profile.status='community_restricted' and profile.restricted_until<=now()
    then 'active'::public.account_status else profile.status end,'restricted_until',profile.restricted_until,
    'sanction_id',sanction.id::text,'reason_category',sanction.reason_category,'notice_seen_at',sanction.notice_seen_at);
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
  if viewer_id is not null then perform private.assert_account_access(); end if;
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
  perform private.assert_account_access();
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
$function$;

CREATE OR REPLACE FUNCTION private.get_pending_policies()
  RETURNS SETOF public.legal_policies
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return query
  select latest.*
  from (
    select distinct on (policy.kind) policy.*
    from public.legal_policies as policy
    where policy.effective_at <= now()
    order by policy.kind, policy.effective_at desc
  ) as latest
  where latest.requires_reconsent
    and not exists (
      select 1
      from private.user_policy_consents as consent
      where consent.user_id = current_user_id
        and consent.policy_id = latest.id
    );
end;
$function$;

CREATE OR REPLACE FUNCTION private.import_csv (
  request_id  uuid,
  import_plan jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
  job_id bigint;
  saved_result jsonb;
  mapping jsonb;
  item jsonb;
  entry jsonb;
  source_name text;
  final_name text;
  stored_folder_name text;
  target_folder_id bigint;
  target_product_id bigint;
  folder_ids jsonb := '{}'::jsonb;
  existing_folder_ids jsonb;
  folder_errors jsonb := '{}'::jsonb;
  folder_warnings jsonb[] := '{}'::jsonb[];
  excluded jsonb[] := '{}'::jsonb[];
  total integer;
  imported integer := 0;
  duplicate_total integer := 0;
  failed_total integer := 0;
  price_value integer;
  saved_time timestamptz;
  input_error text;
  failure_reason public.import_fail_reason;
  was_duplicate boolean;
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if import_plan->>'userId' is distinct from current_user_id::text then
    raise exception 'account_changed' using errcode = '42501';
  end if;
  if request_id is null or jsonb_typeof(import_plan) is distinct from 'object'
    or jsonb_typeof(import_plan->'products') is distinct from 'array'
    or jsonb_typeof(import_plan->'folderMappings') is distinct from 'array'
    or jsonb_typeof(import_plan->'failures') is distinct from 'array'
    or jsonb_typeof(import_plan->'duplicates') is distinct from 'array'
    or coalesce(import_plan->>'totalCount', '') !~ '^[0-9]{1,8}$' then
    raise exception 'invalid_import_plan' using errcode = '22023';
  end if;
  total := (import_plan->>'totalCount')::integer;
  if total <> jsonb_array_length(import_plan->'products')
    + jsonb_array_length(import_plan->'failures') + jsonb_array_length(import_plan->'duplicates') then
    raise exception 'invalid_import_plan' using errcode = '22023';
  end if;

  -- 일반 폴더 생성의 한도 트리거와 같은 행을 잠가 두 Import가 동시에 50개를 넘지 않게 한다.
  perform 1 from public.profiles where id = current_user_id for update;
  if not found then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select j.result into saved_result from public.import_jobs j
  where j.user_id = current_user_id and j.request_id = import_csv.request_id;
  if found then
    return saved_result;
  end if;
  -- 상품을 먼저, 폴더를 나중에 id 순으로 잠가 소장 처리와 교착하지 않게 한다.
  perform p.id from public.products p
  where p.user_id = current_user_id
    and p.url in (select value->>'url' from jsonb_array_elements(import_plan->'products'))
  order by p.id for update;
  perform f.id from public.folders f where f.user_id = current_user_id order by f.id for update;
  insert into public.import_jobs (user_id, request_id, total_count)
  values (current_user_id, request_id, total) returning id into job_id;
  select coalesce(jsonb_object_agg(f.name, f.id), '{}') into existing_folder_ids
  from public.folders f where f.user_id = current_user_id and f.kind = 'custom';

  for mapping in select value from jsonb_array_elements(import_plan->'folderMappings') loop
    source_name := mapping->>'sourceName';
    final_name := mapping->>'folderName';
    if source_name is null or btrim(source_name) = '' or source_name <> normalize(btrim(source_name), NFC)
      or final_name is null or final_name <> normalize(btrim(final_name), NFC)
      or private.char_count(final_name) not between 1 and 7 or final_name = '나의 소장템'
      or folder_ids ? source_name or folder_errors ? source_name then
      raise exception 'invalid_folder_mapping' using errcode = '22023';
    end if;
    -- 이전 Import에서 잘라 만든 이름보다 보존된 원본 버킷명을 먼저 확인한다.
    select f.id, f.name into target_folder_id, stored_folder_name from public.folders f
    where f.user_id = current_user_id and f.kind = 'custom' and f.csv_source_name = source_name;
    if found then
      if final_name <> stored_folder_name then
        raise exception 'csv_folder_conflict' using errcode = '40001';
      end if;
      folder_ids := folder_ids || jsonb_build_object(source_name, target_folder_id);
      continue;
    end if;
    if existing_folder_ids ? source_name then
      target_folder_id := (existing_folder_ids->>source_name)::bigint;
      if final_name <> source_name then
        raise exception 'csv_folder_conflict' using errcode = '40001';
      end if;
      folder_ids := folder_ids || jsonb_build_object(source_name, target_folder_id);
      continue;
    end if;
    -- 조회 뒤 다른 요청이 같은 후보 이름을 만들었으면 클라이언트가 최신 목록으로 다시 계산한다.
    if exists (select 1 from public.folders where user_id = current_user_id and name = final_name) then
      raise exception 'csv_folder_conflict' using errcode = '40001';
    end if;
    if (select count(*) from public.folders where user_id = current_user_id and kind = 'custom') >= 50 then
      folder_errors := folder_errors || jsonb_build_object(source_name, 'FOLDER_LIMIT_EXCEEDED');
      continue;
    end if;
    begin
      insert into public.folders (user_id, name, csv_source_name) values (current_user_id, final_name, source_name)
      returning id into target_folder_id;
      folder_ids := folder_ids || jsonb_build_object(source_name, target_folder_id);
    exception
      when unique_violation then
        raise exception 'csv_folder_conflict' using errcode = '40001';
      when check_violation then
        folder_errors := folder_errors || jsonb_build_object(source_name, 'FOLDER_SAVE_FAILED');
    end;
  end loop;

  for entry in select value from jsonb_array_elements(import_plan->'failures') loop
    if coalesce(entry->>'rowNumber', '') !~ '^[0-9]{1,8}$' or (entry->>'rowNumber')::integer < 2
      or jsonb_typeof(entry->'productName') is distinct from 'string' or entry->>'reason' is null then
      raise exception 'invalid_import_plan' using errcode = '22023';
    end if;
    failure_reason := (entry->>'reason')::public.import_fail_reason;
    if failure_reason in ('FOLDER_LIMIT_EXCEEDED', 'FOLDER_SAVE_FAILED') then
      raise exception 'invalid_import_plan' using errcode = '22023';
    end if;
    insert into public.import_failures (job_id, user_id, row_number, product_name, reason)
    values (job_id, current_user_id, (entry->>'rowNumber')::integer, entry->>'productName', failure_reason);
    excluded := array_append(excluded, entry || jsonb_build_object('kind', 'failed'));
    failed_total := failed_total + 1;
  end loop;
  for entry in select value from jsonb_array_elements(import_plan->'duplicates') loop
    if coalesce(entry->>'rowNumber', '') !~ '^[0-9]{1,8}$' or (entry->>'rowNumber')::integer < 2
      or jsonb_typeof(entry->'productName') is distinct from 'string' then
      raise exception 'invalid_import_plan' using errcode = '22023';
    end if;
    excluded := array_append(excluded, entry || jsonb_build_object('kind', 'duplicate', 'reason', 'DUPLICATE'));
    duplicate_total := duplicate_total + 1;
  end loop;

  for item in select value from jsonb_array_elements(import_plan->'products') loop
    if coalesce(item->>'rowNumber', '') !~ '^[0-9]{1,8}$' or (item->>'rowNumber')::integer < 2
      or jsonb_typeof(item->'sourceFolderNames') is distinct from 'array'
      or jsonb_typeof(item->'isOwned') is distinct from 'boolean' then
      raise exception 'invalid_import_plan' using errcode = '22023';
    end if;
    -- 잘못된 선택 가격은 상품 행을 버리지 않는다. products의 integer 범위도 넘기지 않는다.
    price_value := null;
    if coalesce(item->>'price', '') ~ '^[0-9]{1,10}$' then
      if (item->>'price')::numeric <= 2147483647 then price_value := (item->>'price')::integer; end if;
    end if;
    input_error := private.product_input_error(item->>'url', item->>'name', item->>'brand', price_value);
    if input_error is null and ((item->>'url') ~ '[[:space:]]'
      or (item->>'url') !~* '^https://[^/?#[:space:]]+') then input_error := 'invalid_url'; end if;
    begin
      saved_time := (item->>'savedAt')::timestamptz;
      if saved_time is null or not isfinite(saved_time) or saved_time > now() then
        input_error := 'invalid_date';
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      input_error := 'invalid_date';
    end;
    if input_error is not null then
      failure_reason := case input_error
        when 'invalid_url' then 'INVALID_PRODUCT_URL'::public.import_fail_reason
        when 'name_required' then 'EMPTY_PRODUCT_NAME'::public.import_fail_reason
        else 'INVALID_PRODUCT_DATA'::public.import_fail_reason end;
      insert into public.import_failures (job_id, user_id, row_number, product_name, reason)
      values (job_id, current_user_id, (item->>'rowNumber')::integer, item->>'name', failure_reason);
      excluded := array_append(excluded, jsonb_build_object(
        'rowNumber', item->'rowNumber', 'productName', coalesce(item->>'name', ''), 'kind', 'failed', 'reason', failure_reason));
      failed_total := failed_total + 1;
      continue;
    end if;

    insert into public.products (user_id, url, name, brand, price, saved_at)
    values (current_user_id, item->>'url', item->>'name', item->>'brand', price_value, saved_time)
    on conflict on constraint products_user_id_url_key do nothing
    returning id into target_product_id;
    was_duplicate := target_product_id is null;
    if was_duplicate then
      select p.id into target_product_id from public.products p
      where p.user_id = current_user_id and p.url = item->>'url' for update;
      if not found then raise exception 'csv_product_conflict' using errcode = '40001'; end if;
      excluded := array_append(excluded, jsonb_build_object(
        'rowNumber', item->'rowNumber', 'productName', item->>'name', 'kind', 'duplicate', 'reason', 'DUPLICATE'));
      duplicate_total := duplicate_total + 1;
    else
      imported := imported + 1;
    end if;
    if (item->>'isOwned')::boolean then perform private.set_owned(target_product_id, true); end if;
    for source_name in select distinct value from jsonb_array_elements_text(item->'sourceFolderNames') loop
      if not (folder_ids ? source_name or folder_errors ? source_name) then
        raise exception 'invalid_folder_mapping' using errcode = '22023';
      end if;
      if folder_ids ? source_name then
        begin
          insert into public.product_folders (product_id, folder_id, user_id)
          values (target_product_id, (folder_ids->>source_name)::bigint, current_user_id)
          on conflict do nothing;
          continue;
        exception when foreign_key_violation then
          -- 일반 폴더가 동시에 삭제되어도 이미 저장한 상품은 ALL에 남긴다.
          failure_reason := 'FOLDER_SAVE_FAILED';
        end;
      else
        failure_reason := (folder_errors->>source_name)::public.import_fail_reason;
      end if;
      insert into public.import_failures (job_id, user_id, row_number, product_name, source_folder_name, reason)
      values (job_id, current_user_id, (item->>'rowNumber')::integer, item->>'name', source_name, failure_reason);
      folder_warnings := array_append(folder_warnings, jsonb_build_object(
        'rowNumber', item->'rowNumber', 'productName', item->>'name', 'sourceFolderName', source_name, 'reason', failure_reason));
    end loop;
  end loop;

  saved_result := jsonb_build_object('importedCount', imported, 'excludedProducts', excluded, 'folderFailures', folder_warnings);
  update public.import_jobs j set status = 'completed', success_count = imported, failed_count = failed_total,
    duplicate_count = duplicate_total, result = saved_result, finished_at = clock_timestamp()
  where j.id = job_id;
  return saved_result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.lookup_suspended_identity (
  identity_provider text,
  identity_subject  text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select jsonb_build_object('status','suspended','sanction_id',s.id::text,'reason_category',s.reason_category)
  from auth.identities i join public.profiles p on p.id=i.user_id
  join lateral (select * from private.user_sanctions where user_id=p.id and kind='suspended' and released_at is null order by id desc limit 1) s on true
  where i.provider=identity_provider and i.provider_id=identity_subject and p.status='suspended';
$function$;

CREATE OR REPLACE FUNCTION private.register_push_token (
  new_token    text,
  new_platform text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  insert into public.push_tokens (user_id, token, platform)
  values (current_user_id, new_token, new_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform;
end;
$function$;

CREATE OR REPLACE FUNCTION private.reject_audit_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin raise exception 'audit_is_append_only' using errcode = '42501'; end;
$function$;

CREATE OR REPLACE FUNCTION private.save_product (
  product_url        text,
  product_name       text,
  product_brand      text              DEFAULT NULL::text,
  product_price      integer           DEFAULT NULL::integer,
  product_image_url  text              DEFAULT NULL::text,
  product_wish_level public.wish_level DEFAULT NULL::public.wish_level,
  folder_ids         bigint[]          DEFAULT NULL::bigint[]
)
  RETURNS TABLE (
    product_id   bigint,
    is_duplicate boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
  input_error text;
  saved_id bigint;
  is_owned boolean;
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  input_error := private.product_input_error(product_url, product_name, product_brand, product_price);
  if input_error is not null then
    raise exception '%', input_error using errcode = '22023';
  end if;

  select p.id into saved_id
  from public.products p
  where p.user_id = current_user_id and p.url = btrim(product_url);
  if saved_id is not null then
    return query select saved_id, true;
    return;
  end if;

  is_owned := exists (
    select 1 from public.folders f
    where f.id = any (coalesce(folder_ids, '{}')) and f.user_id = current_user_id and f.kind = 'owned'
  );

  insert into public.products (user_id, url, name, brand, price, image_url, wish_level)
  values (
    current_user_id,
    product_url,
    product_name,
    product_brand,
    product_price,
    product_image_url,
    case when is_owned then null else product_wish_level end
  )
  on conflict on constraint products_user_id_url_key do nothing
  returning id into saved_id;

  -- 같은 링크를 동시에 저장하면 먼저 들어간 상품을 돌려준다.
  if saved_id is null then
    select p.id into saved_id
    from public.products p
    where p.user_id = current_user_id and p.url = btrim(product_url);
    return query select saved_id, true;
    return;
  end if;

  insert into public.product_folders (product_id, folder_id, user_id)
  select saved_id, folder_id, current_user_id
  from unnest(coalesce(folder_ids, '{}')) as folder_id
  on conflict do nothing;

  return query select saved_id, false;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_avatar (
  new_path text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if new_path is not null and new_path !~ ('^' || current_user_id::text || '/[^/]+$') then
    raise exception 'invalid_avatar_path' using errcode = '22023';
  end if;

  update public.profiles set avatar_path = new_path where id = current_user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_owned (
  target_product_id  bigint,
  is_owned           boolean,
  keep_other_folders boolean           DEFAULT true,
  new_wish_level     public.wish_level DEFAULT NULL::public.wish_level
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
  owned_folder_id bigint;
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  perform 1 from public.products
  where id = target_product_id and user_id = current_user_id
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = '22023';
  end if;

  select id into owned_folder_id
  from public.folders
  where user_id = current_user_id and kind = 'owned';

  if is_owned then
    update public.products set wish_level = null where id = target_product_id;
    insert into public.product_folders (product_id, folder_id, user_id)
    values (target_product_id, owned_folder_id, current_user_id)
    on conflict do nothing;
    if not keep_other_folders then
      delete from public.product_folders
      where product_id = target_product_id and folder_id <> owned_folder_id;
    end if;
  else
    -- 해제할 때 위시레벨을 고르지 않으면 미선택(null)으로 둔다. 저장할 때 미선택을 허용하는 것(SAVE-011)과 같다.
    delete from public.product_folders
    where product_id = target_product_id and folder_id = owned_folder_id;
    update public.products set wish_level = new_wish_level where id = target_product_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_product_folders (
  target_product_id bigint,
  folder_ids        bigint[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
  selected bigint[] := coalesce(folder_ids, '{}');
  owned_folder_id bigint;
  is_owned boolean;
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  perform 1 from public.products
  where id = target_product_id and user_id = current_user_id
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = '22023';
  end if;

  -- 남의 폴더나 없는 폴더가 섞이면 아무것도 바꾸지 않는다.
  if exists (
    select 1 from unnest(selected) as picked(id)
    where not exists (
      select 1 from public.folders f where f.id = picked.id and f.user_id = current_user_id
    )
  ) then
    raise exception 'folder_not_found' using errcode = '22023';
  end if;

  select id into owned_folder_id
  from public.folders
  where user_id = current_user_id and kind = 'owned';

  select exists (
    select 1 from public.product_folders
    where product_id = target_product_id and folder_id = owned_folder_id
  ) into is_owned;

  -- 나의 소장템은 위시레벨 규칙이 있어 set_owned로만 넣고 뺀다.
  if (owned_folder_id = any(selected)) is distinct from is_owned then
    perform private.set_owned(target_product_id, owned_folder_id = any(selected));
  end if;

  delete from public.product_folders pf
  using public.folders f
  where pf.product_id = target_product_id
    and f.id = pf.folder_id
    and f.kind = 'custom'
    and not (pf.folder_id = any(selected));

  insert into public.product_folders (product_id, folder_id, user_id)
  select target_product_id, f.id, current_user_id
  from public.folders f
  where f.user_id = current_user_id and f.kind = 'custom' and f.id = any(selected)
  on conflict do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION private.update_nickname (
  new_nickname text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  current_user_id uuid := (select auth.uid());
  error_code text;
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  error_code := private.nickname_error(new_nickname, current_user_id);
  if error_code is not null then
    return error_code;
  end if;

  update public.profiles set nickname = new_nickname where id = current_user_id;
  return null;
exception when unique_violation then
  return 'duplicate';
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_moderation_reason (
  category    text,
  explanation text
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if category is null or category not in ('abuse','spam','inappropriate','other') or
    explanation is null or explanation !~ '[^[:space:]]' or private.char_count(btrim(explanation)) not between 1 and 1000 then
    raise exception 'invalid_moderation_reason' using errcode = '22023';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.acknowledge_sanction_notice (
  sanction_id bigint
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.acknowledge_sanction_notice(sanction_id); $function$;

REVOKE ALL ON FUNCTION "public"."acknowledge_sanction_notice"(bigint) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.admin_content_action (
  actor         uuid,
  actor_session uuid,
  request_id    uuid,
  report        bigint,
  operation     text,
  new_status    text,
  category      text,
  explanation   text
)
  RETURNS text
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.admin_content_action(actor,actor_session,request_id,report,operation,new_status,category,explanation); $function$;

REVOKE ALL ON FUNCTION "public"."admin_content_action"(uuid, uuid, uuid, bigint, text, text, text, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.admin_prepare_sanction (
  actor         uuid,
  actor_session uuid,
  request_id    uuid,
  target_user   uuid,
  operation     text,
  category      text,
  explanation   text,
  report        bigint DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.admin_prepare_sanction(actor,actor_session,request_id,target_user,operation,category,explanation,report); $function$;

REVOKE ALL ON FUNCTION "public"."admin_prepare_sanction"(uuid, uuid, uuid, uuid, text, text, text, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.admin_report_detail (
  actor            uuid,
  actor_session    uuid,
  report           bigint,
  before_report_id bigint DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.admin_report_detail(actor,actor_session,report,before_report_id); $function$;

REVOKE ALL ON FUNCTION "public"."admin_report_detail"(uuid, uuid, bigint, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.admin_report_groups (
  actor         uuid,
  actor_session uuid,
  before_id     bigint DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.admin_report_groups(actor,actor_session,before_id); $function$;

REVOKE ALL ON FUNCTION "public"."admin_report_groups"(uuid, uuid, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.admin_sanction_request (
  actor         uuid,
  actor_session uuid,
  request_id    uuid,
  mark_failed   boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.admin_sanction_request(actor,actor_session,request_id,mark_failed); $function$;

REVOKE ALL ON FUNCTION "public"."admin_sanction_request"(uuid, uuid, uuid, boolean) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_account_access()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.get_account_access(); $function$;

REVOKE ALL ON FUNCTION "public"."get_account_access"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.lookup_suspended_identity (
  identity_provider text,
  identity_subject  text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.lookup_suspended_identity(identity_provider,identity_subject); $function$;

REVOKE ALL ON FUNCTION "public"."lookup_suspended_identity"(text, text) FROM PUBLIC, "anon", "authenticated";

ALTER TABLE "private"."admin_users"
  ADD CONSTRAINT "admin_users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE "private"."admin_actions"
  ADD CONSTRAINT "admin_actions_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES private.admin_users(id);

ALTER TABLE "private"."comments"
  ADD CONSTRAINT "comments_hidden_by_fkey" FOREIGN KEY (hidden_by) REFERENCES private.admin_users(id);

ALTER TABLE "private"."moderation_requests"
  ADD CONSTRAINT "moderation_requests_action_id_fkey" FOREIGN KEY (action_id) REFERENCES private.admin_actions(id);

ALTER TABLE "private"."moderation_requests"
  ADD CONSTRAINT "moderation_requests_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES private.admin_users(id);

ALTER TABLE "private"."moderation_requests"
  ADD CONSTRAINT "moderation_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "private"."posts"
  ADD CONSTRAINT "posts_hidden_by_fkey" FOREIGN KEY (hidden_by) REFERENCES private.admin_users(id);

ALTER TABLE "private"."user_sanctions"
  ADD CONSTRAINT "user_sanctions_action_id_fkey" FOREIGN KEY (action_id) REFERENCES private.admin_actions(id);

ALTER TABLE "private"."user_sanctions"
  ADD CONSTRAINT "user_sanctions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX admin_actions_admin_idx ON private.admin_actions USING btree (admin_id);

CREATE INDEX admin_actions_report_idx ON private.admin_actions USING btree (report_id, id DESC);

CREATE INDEX admin_actions_target_idx ON private.admin_actions USING btree (target_type, target_id, id DESC);

CREATE INDEX comments_hidden_by_idx ON private.comments USING btree (hidden_by);

CREATE INDEX moderation_requests_action_idx ON private.moderation_requests USING btree (action_id);

CREATE INDEX moderation_requests_admin_idx ON private.moderation_requests USING btree (admin_id);

CREATE UNIQUE INDEX moderation_requests_one_pending_user ON private.moderation_requests USING btree (user_id)
  WHERE (state = 'pending'::text);

CREATE INDEX moderation_requests_user_idx ON private.moderation_requests USING btree (user_id);

CREATE INDEX posts_hidden_by_idx ON private.posts USING btree (hidden_by);

CREATE INDEX user_sanctions_user_idx ON private.user_sanctions USING btree (user_id, id DESC);

CREATE CONSTRAINT TRIGGER on_auth_moderation_updated
  AFTER UPDATE ON auth.users DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.apply_auth_moderation();

CREATE TRIGGER admin_actions_append_only
  BEFORE DELETE OR UPDATE ON private.admin_actions
  FOR EACH ROW
  EXECUTE FUNCTION private.reject_audit_change();

CREATE TRIGGER admin_actions_no_truncate
  BEFORE TRUNCATE ON private.admin_actions
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.reject_audit_change();

CREATE POLICY "consents_active_account" ON "private"."user_policy_consents"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT private.account_is_active() AS account_is_active))
  WITH CHECK (( SELECT private.account_is_active() AS account_is_active));

CREATE POLICY "folders_active_account" ON "public"."folders"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT private.account_is_active() AS account_is_active))
  WITH CHECK (( SELECT private.account_is_active() AS account_is_active));

CREATE POLICY "import_failures_active_account" ON "public"."import_failures"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT private.account_is_active() AS account_is_active))
  WITH CHECK (( SELECT private.account_is_active() AS account_is_active));

CREATE POLICY "imports_active_account" ON "public"."import_jobs"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT private.account_is_active() AS account_is_active))
  WITH CHECK (( SELECT private.account_is_active() AS account_is_active));

CREATE POLICY "product_folders_active_account" ON "public"."product_folders"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT private.account_is_active() AS account_is_active))
  WITH CHECK (( SELECT private.account_is_active() AS account_is_active));

CREATE POLICY "products_active_account" ON "public"."products"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT private.account_is_active() AS account_is_active))
  WITH CHECK (( SELECT private.account_is_active() AS account_is_active));

CREATE POLICY "profiles_active_account" ON "public"."profiles"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT private.account_is_active() AS account_is_active))
  WITH CHECK (( SELECT private.account_is_active() AS account_is_active));

CREATE POLICY "push_tokens_active_account" ON "public"."push_tokens"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT private.account_is_active() AS account_is_active))
  WITH CHECK (( SELECT private.account_is_active() AS account_is_active));

CREATE POLICY "avatars_active_account" ON "storage"."objects"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT private.account_is_active() AS account_is_active))
  WITH CHECK (( SELECT private.account_is_active() AS account_is_active));

REVOKE ALL ON FUNCTION "private"."account_is_active"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."account_is_active"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."acknowledge_sanction_notice"(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."acknowledge_sanction_notice"(bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."admin_content_action"(uuid, uuid, uuid, bigint, text, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."admin_content_action"(uuid, uuid, uuid, bigint, text, text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."admin_prepare_sanction"(uuid, uuid, uuid, uuid, text, text, text, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."admin_prepare_sanction"(uuid, uuid, uuid, uuid, text, text, text, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "private"."admin_report_detail"(uuid, uuid, bigint, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."admin_report_detail"(uuid, uuid, bigint, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "private"."admin_report_groups"(uuid, uuid, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."admin_report_groups"(uuid, uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "private"."admin_sanction_request"(uuid, uuid, uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."admin_sanction_request"(uuid, uuid, uuid, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "private"."apply_auth_moderation"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."assert_account_access"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."assert_account_access"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."assert_moderator"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."get_account_access"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_account_access"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."lookup_suspended_identity"(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."lookup_suspended_identity"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."reject_audit_change"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."validate_moderation_reason"(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."acknowledge_sanction_notice"(bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."acknowledge_sanction_notice"(bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."acknowledge_sanction_notice"(bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."acknowledge_sanction_notice"(bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."admin_content_action"(uuid, uuid, uuid, bigint, text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_content_action"(uuid, uuid, uuid, bigint, text, text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_content_action"(uuid, uuid, uuid, bigint, text, text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."admin_prepare_sanction"(uuid, uuid, uuid, uuid, text, text, text, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_prepare_sanction"(uuid, uuid, uuid, uuid, text, text, text, bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_prepare_sanction"(uuid, uuid, uuid, uuid, text, text, text, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."admin_report_detail"(uuid, uuid, bigint, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_report_detail"(uuid, uuid, bigint, bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_report_detail"(uuid, uuid, bigint, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."admin_report_groups"(uuid, uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_report_groups"(uuid, uuid, bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_report_groups"(uuid, uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."admin_sanction_request"(uuid, uuid, uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_sanction_request"(uuid, uuid, uuid, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_sanction_request"(uuid, uuid, uuid, boolean) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_account_access"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_account_access"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_account_access"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_account_access"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."lookup_suspended_identity"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."lookup_suspended_identity"(text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."lookup_suspended_identity"(text, text) TO "service_role";

REVOKE ALL ON SCHEMA "private" FROM "service_role";

GRANT USAGE ON SCHEMA "private" TO "service_role";
