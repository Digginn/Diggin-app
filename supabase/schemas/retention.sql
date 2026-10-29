-- 개인정보 처리방침 제3조 보유기간이 지난 기록을 지운다(MY-007, RPT-005, RPT-006, #164).
-- 이의제기·분쟁 중인 신고·제재는 운영자가 보관 유지를 표시해 자동 삭제에서 뺀다.
create table private.retention_holds (
  target_type text not null check (target_type in ('report', 'sanction')),
  target_id bigint not null,
  admin_id uuid not null references private.admin_users(id),
  created_at timestamptz not null default now(),
  primary key (target_type, target_id)
);
alter table private.retention_holds enable row level security;
revoke all on table private.retention_holds from public, anon, authenticated, service_role;

create or replace function private.admin_set_retention_hold(actor uuid, actor_session uuid,
  hold_type text, hold_id bigint, is_held boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function public.admin_set_retention_hold(actor uuid, actor_session uuid,
  hold_type text, hold_id bigint, is_held boolean)
returns boolean language sql security invoker set search_path = '' as $$
  select private.admin_set_retention_hold(actor, actor_session, hold_type, hold_id, is_held);
$$;
revoke execute on function private.admin_set_retention_hold(uuid, uuid, text, bigint, boolean),
  public.admin_set_retention_hold(uuid, uuid, text, bigint, boolean) from public, anon, authenticated;
grant execute on function private.admin_set_retention_hold(uuid, uuid, text, bigint, boolean),
  public.admin_set_retention_hold(uuid, uuid, text, bigint, boolean) to service_role;

create or replace function private.is_admin_action_expired(action_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.admin_actions a
    where a.id = action_id and a.created_at < now() - interval '1 year'
      and not exists (select 1 from private.user_sanctions s where s.action_id = a.id)
      and not exists (select 1 from private.retention_holds h where h.target_type = 'report' and h.target_id = a.report_id)
  );
$$;
revoke execute on function private.is_admin_action_expired(bigint) from public, anon, authenticated, service_role;

create or replace function private.delete_expired_records()
returns void language plpgsql security definer set search_path = '' as $$
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
$$;
revoke execute on function private.delete_expired_records() from public, anon, authenticated, service_role;
select cron.schedule('expired-records-cleanup', '20 18 * * *', 'select private.delete_expired_records()');
