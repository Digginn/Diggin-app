SET local check_function_bodies = off;

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
  insert into private.admin_access_logs(admin_id, report_id) values (actor, report);
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.admin_set_retention_hold (
  actor         uuid,
  actor_session uuid,
  hold_type     text,
  hold_id       bigint,
  is_held       boolean
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.assert_moderator(actor, actor_session);
  if hold_type is null or hold_type not in ('report', 'sanction') or hold_id is null or is_held is null then
    raise exception 'invalid_retention_hold' using errcode = '22023';
  end if;
  if (hold_type = 'report' and not exists (select 1 from private.reports where id = hold_id)) or
    (hold_type = 'sanction' and not exists (select 1 from private.user_sanctions where id = hold_id)) then
    raise exception 'retention_target_not_found' using errcode = 'P0002';
  end if;
  if is_held then
    insert into private.retention_holds(target_type, target_id, admin_id)
      values (hold_type, hold_id, actor) on conflict do nothing;
  else
    delete from private.retention_holds where target_type = hold_type and target_id = hold_id;
  end if;
  return is_held;
end;
$function$;

CREATE OR REPLACE FUNCTION private.delete_apple_refresh_token_secret()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION private.delete_expired_records()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from private.withdrawal_surveys where created_at < now() - interval '30 days';

  -- 신고 대상 콘텐츠 사본: 처리 완료(resolved·rejected) 후 30일. 처리 완료 뒤에는 상태가 바뀌지 않아 updated_at이 완료 시각이다.
  update private.reports r set reported_content = null
  where r.reported_content is not null and r.status in ('resolved', 'rejected')
    and r.updated_at < now() - interval '30 days'
    and not exists (select 1 from private.retention_holds h where h.target_type = 'report' and h.target_id = r.id);

  -- 해제되지 않은 영구 제한은 기간을 세지 않고 남긴다.
  delete from private.user_sanctions s
  where ((s.kind = 'warning' and s.created_at < now() - interval '6 months') or
    (s.kind = 'community_restricted' and s.restricted_until < now() - interval '6 months') or
    (s.kind = 'suspended' and s.released_at < now() - interval '6 months'))
    and not exists (select 1 from private.retention_holds h where h.target_type = 'sanction' and h.target_id = s.id);

  -- 아직 남은 제재와 보관 유지 중인 신고의 조치 기록은 1년이 지나도 남긴다.
  delete from private.moderation_requests m
  where m.state <> 'pending' and m.created_at < now() - interval '1 year'
    and (m.action_id is null or private.is_admin_action_expired(m.action_id));
  perform pg_catalog.set_config('private.retention_cleanup', 'on', true);
  delete from private.admin_actions a
  where private.is_admin_action_expired(a.id)
    and not exists (select 1 from private.moderation_requests m where m.action_id = a.id);
  perform pg_catalog.set_config('private.retention_cleanup', '', true);
  delete from private.admin_access_logs l where l.created_at < now() - interval '1 year'
    and not exists (select 1 from private.retention_holds h where h.target_type = 'report' and h.target_id = l.report_id);
  delete from private.retention_holds h
  where (h.target_type = 'report' and not exists (select 1 from private.reports r where r.id = h.target_id)) or
    (h.target_type = 'sanction' and not exists (select 1 from private.user_sanctions s where s.id = h.target_id));
end;
$function$;

CREATE OR REPLACE FUNCTION private.due_underage_deletions()
  RETURNS TABLE (
    user_id             uuid,
    apple_refresh_token text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select p.id, secret.decrypted_secret
  from public.profiles p
  join lateral (
    select s.reason_category, s.created_at from private.user_sanctions s
    where s.user_id = p.id and s.kind = 'suspended' and s.released_at is null
    order by s.id desc limit 1
  ) sanction on true
  left join private.apple_refresh_tokens token on token.user_id = p.id
  left join vault.decrypted_secrets secret on secret.id = token.secret_id
  where p.status = 'suspended' and sanction.reason_category = 'underage'
    and sanction.created_at <= now() - interval '1 month'
  order by sanction.created_at
  limit 50;
$function$;

CREATE OR REPLACE FUNCTION private.invoke_underage_cleanup()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  function_url text;
  cleanup_secret text;
begin
  if not exists (select 1 from private.due_underage_deletions()) then return null; end if;
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'underage_cleanup_url';
  select decrypted_secret into cleanup_secret from vault.decrypted_secrets where name = 'underage_cleanup_secret';
  if function_url is null or cleanup_secret is null then return null; end if;
  return net.http_post(url := function_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || cleanup_secret),
    body := '{}'::jsonb, timeout_milliseconds := 5000);
end;
$function$;

CREATE OR REPLACE FUNCTION private.is_admin_action_expired (
  action_id bigint
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from private.admin_actions a
    where a.id = action_id and a.created_at < now() - interval '1 year'
      and not exists (select 1 from private.user_sanctions s where s.action_id = a.id)
      and not exists (select 1 from private.retention_holds h where h.target_type = 'report' and h.target_id = a.report_id)
  );
$function$;

CREATE OR REPLACE FUNCTION private.reject_audit_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  -- private.delete_expired_records()만 보관기간이 지난 기록을 지운다. 앱·service_role은 테이블 권한이 없어 이 설정으로 우회할 수 없다.
  if tg_op = 'DELETE' and current_setting('private.retention_cleanup', true) = 'on' then return old; end if;
  raise exception 'audit_is_append_only' using errcode = '42501';
end;
$function$;

CREATE OR REPLACE FUNCTION private.store_apple_refresh_token (
  target_user   uuid,
  refresh_token text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare existing uuid;
begin
  if target_user is null or refresh_token is null or refresh_token !~ '^[[:graph:]]+$' or
    pg_catalog.length(refresh_token) > 4096 then
    raise exception 'invalid_apple_refresh_token' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user::text, 0));
  select secret_id into existing from private.apple_refresh_tokens where user_id = target_user;
  if existing is null then
    insert into private.apple_refresh_tokens(user_id, secret_id)
      values (target_user, vault.create_secret(refresh_token));
  else
    perform vault.update_secret(existing, refresh_token);
    update private.apple_refresh_tokens set updated_at = now() where user_id = target_user;
  end if;
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
  if category is null or category not in ('abuse','spam','inappropriate','other','underage') or
    explanation is null or explanation !~ '[^[:space:]]' or private.char_count(btrim(explanation)) not between 1 and 1000 then
    raise exception 'invalid_moderation_reason' using errcode = '22023';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_retention_hold (
  actor         uuid,
  actor_session uuid,
  hold_type     text,
  hold_id       bigint,
  is_held       boolean
)
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.admin_set_retention_hold(actor, actor_session, hold_type, hold_id, is_held);
$function$;

REVOKE ALL ON FUNCTION "public"."admin_set_retention_hold"(uuid, uuid, text, bigint, boolean) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.due_underage_deletions()
  RETURNS TABLE (
    user_id             uuid,
    apple_refresh_token text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select * from private.due_underage_deletions();
$function$;

REVOKE ALL ON FUNCTION "public"."due_underage_deletions"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.store_apple_refresh_token (
  target_user   uuid,
  refresh_token text
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.store_apple_refresh_token(target_user, refresh_token);
$function$;

REVOKE ALL ON FUNCTION "public"."store_apple_refresh_token"(uuid, text) FROM PUBLIC, "anon", "authenticated";

ALTER TABLE "private"."admin_access_logs"
  ADD CONSTRAINT "admin_access_logs_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES private.admin_users(id);

ALTER TABLE "private"."apple_refresh_tokens"
  ADD CONSTRAINT "apple_refresh_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "private"."retention_holds"
  ADD CONSTRAINT "retention_holds_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES private.admin_users(id);

CREATE INDEX admin_access_logs_admin_idx ON private.admin_access_logs USING btree (admin_id);

CREATE INDEX admin_access_logs_created_idx ON private.admin_access_logs USING btree (created_at);

CREATE TRIGGER apple_refresh_tokens_delete_secret
  AFTER DELETE ON private.apple_refresh_tokens
  FOR EACH ROW
  EXECUTE FUNCTION private.delete_apple_refresh_token_secret();

REVOKE ALL ON FUNCTION "private"."admin_set_retention_hold"(uuid, uuid, text, bigint, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."admin_set_retention_hold"(uuid, uuid, text, bigint, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "private"."delete_apple_refresh_token_secret"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."delete_expired_records"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."due_underage_deletions"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."due_underage_deletions"() TO "service_role";

REVOKE ALL ON FUNCTION "private"."invoke_underage_cleanup"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."is_admin_action_expired"(bigint) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."store_apple_refresh_token"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."store_apple_refresh_token"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."admin_set_retention_hold"(uuid, uuid, text, bigint, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_set_retention_hold"(uuid, uuid, text, bigint, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_set_retention_hold"(uuid, uuid, text, bigint, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."due_underage_deletions"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."due_underage_deletions"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."due_underage_deletions"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."store_apple_refresh_token"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."store_apple_refresh_token"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."store_apple_refresh_token"(uuid, text) TO "service_role";

SELECT cron.schedule_in_database('expired-records-cleanup', '20 18 * * *', 'select private.delete_expired_records()', 'postgres', NULL, true);

SELECT cron.schedule_in_database('underage-account-cleanup', '30 18 * * *', 'select private.invoke_underage_cleanup()', 'postgres', NULL, true);

