-- #104 알림. 원본은 private에 두고 목록 RPC로만 읽는다. 알림을 누를 때 글이 지워졌는지(NOTI-006)를
-- 앱이 private.posts를 보지 않고 알 수 있어야 해서 public 테이블 대신 RPC로 함께 내려준다.
create extension if not exists pg_cron with schema pg_catalog;

create table private.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  post_id bigint not null references private.posts(id) on delete cascade,
  title text not null,
  body text not null,
  -- 수신자·유형·원본 이벤트로 만든 키. 트리거 재실행·투표 마감 작업 반복에도 한 번만 남긴다.
  event_key text not null unique,
  created_at timestamptz not null default now(),
  push_sent_at timestamptz
);
create index notifications_recipient_idx on private.notifications(recipient_id, created_at desc, id desc);
create index notifications_push_pending_idx on private.notifications(created_at) where push_sent_at is null;
create index notifications_post_idx on private.notifications(post_id);

-- 좋아요는 취소 후 다시 눌러도 같은 사람·같은 글에 한 번만 알린다. 취소해도 지우지 않는다.
create table private.like_notification_log (
  post_id bigint not null references private.posts(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, actor_id)
);
create index like_notification_log_actor_idx on private.like_notification_log(actor_id);

alter table private.notifications enable row level security;
alter table private.like_notification_log enable row level security;
revoke all on table private.notifications, private.like_notification_log from public, anon, authenticated;
revoke all on sequence private.notifications_id_seq from public, anon, authenticated;

-- 받는 사람이 차단했거나 신고한 사람의 행동은 알리지 않는다. 트리거는 행동한 사람 권한으로 돌아 auth.uid()를 쓸 수 없다.
create or replace function private.notification_actor_visible(recipient uuid, actor uuid)
returns boolean language sql stable set search_path = '' as $$
  select not exists (
    select 1 from private.user_blocks b where b.blocker_id = recipient and b.blocked_id = actor
  ) and not exists (
    select 1 from private.reports r where r.reporter_id = recipient and r.reported_user_id = actor
  );
$$;

-- 줄바꿈은 목록·Push 한 줄로 보이도록 공백으로 바꾼다(CMT-001 표시 규칙과 같다).
create or replace function private.notification_text(value text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(value, ''), '\r\n|\r|\n', ' ', 'g');
$$;

-- NOTI-004 내 일반 게시글에 다른 사람이 댓글을 처음 등록했을 때. 재시도는 기존 댓글을 돌려주고 insert가 없다.
create or replace function private.notify_post_commented()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target private.posts%rowtype;
  anon_number integer;
begin
  select * into target from private.posts where id = new.post_id;
  if target.type <> 'post' or target.deleted_at is not null or target.hidden_at is not null or
     new.author_id is null or new.author_id = target.author_id or
     not private.notification_actor_visible(target.author_id, new.author_id) then
    return new;
  end if;
  select number into anon_number from private.post_anon_numbers
  where post_id = new.post_id and user_id = new.author_id;
  insert into private.notifications(recipient_id, type, post_id, title, body, event_key)
  values (target.author_id, 'post_commented', target.id, '내 게시글에 댓글이 달렸어요.',
          '디기 ' || coalesce(anon_number::text, '') || ': ' || private.notification_text(new.content),
          'comment:' || new.id)
  on conflict (event_key) do nothing;
  return new;
end;
$$;

-- NOTI-005 내 일반 게시글에 다른 사람이 좋아요를 처음 눌렀을 때. 이미 누른 상태면 insert가 없어 트리거도 돌지 않는다.
create or replace function private.notify_post_liked()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target private.posts%rowtype;
begin
  select * into target from private.posts where id = new.post_id;
  if target.type <> 'post' or target.deleted_at is not null or target.hidden_at is not null or
     new.user_id is null or new.user_id = target.author_id or
     not private.notification_actor_visible(target.author_id, new.user_id) then
    return new;
  end if;
  insert into private.like_notification_log(post_id, actor_id) values (new.post_id, new.user_id)
  on conflict do nothing;
  if not found then return new; end if;
  insert into private.notifications(recipient_id, type, post_id, title, body, event_key)
  values (target.author_id, 'post_liked', target.id, '내 게시글에 좋아요가 달렸어요.',
          '''' || private.notification_text(target.content) || ''' 게시글을 누군가 좋아해요.',
          'like:' || new.post_id || ':' || new.user_id)
  on conflict (event_key) do nothing;
  return new;
end;
$$;

create trigger comments_notify_post_author
after insert on private.comments
for each row execute function private.notify_post_commented();

create trigger post_likes_notify_post_author
after insert on private.post_likes
for each row execute function private.notify_post_liked();

-- NOTI-003 마감된 투표를 작성자에게 한 번 알린다. 마감 전에 지워지거나 숨겨진 글은 알리지 않는다.
-- 작업이 밀려도 놓치지 않게 시각 범위가 아니라 키로 중복을 막고, 30일 넘은 투표는 목록에서도 안 보여 건너뛴다.
create or replace function private.create_vote_ended_notifications()
returns integer language sql security definer set search_path = '' as $$
  with inserted as (
    insert into private.notifications(recipient_id, type, post_id, title, body, event_key)
    select p.author_id, 'vote_ended', p.id, '투표 결과가 나왔어요.',
      '''' || private.notification_text(p.content) || ''' 투표가 종료됐어요. BUY ' ||
        (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'buy') ||
        ' · NOT ' ||
        (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'not'),
      'vote_ended:' || p.id
    from private.posts p
    where p.type = 'vote' and p.ends_at <= now() and p.ends_at > now() - interval '30 days'
      and p.deleted_at is null and p.hidden_at is null
    on conflict (event_key) do nothing
    returning 1
  )
  select count(*)::integer from inserted;
$$;

create or replace function private.delete_old_notifications()
returns integer language sql security definer set search_path = '' as $$
  with deleted as (
    delete from private.notifications where created_at < now() - interval '30 days' returning 1
  )
  select count(*)::integer from deleted;
$$;

-- NOTI-007 최근 30일 알림을 최신순으로 20개씩 준다. 알림은 항상 받는 사람 자신의 글이라
-- 글이 지워졌거나 숨겨졌는지만 알려 주고, 앱은 누를 때 삭제 안내(NOTI-006)를 띄운다.
create or replace function private.get_notifications(
  after_created_at timestamptz default null, after_id bigint default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer_id uuid := (select auth.uid());
begin
  if viewer_id is null or not exists (
    select 1 from public.profiles where id = viewer_id and status <> 'suspended'
  ) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if (after_created_at is null) <> (after_id is null) then
    raise exception 'invalid_notification_cursor' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id::text, 'type', n.type, 'title', n.title, 'body', n.body, 'created_at', n.created_at,
      'post_id', n.post_id::text, 'post_type', p.type,
      'is_post_available', p.deleted_at is null and p.hidden_at is null
    ) order by n.created_at desc, n.id desc), '[]'::jsonb)
    from (
      select * from private.notifications
      where recipient_id = viewer_id and created_at > now() - interval '30 days'
        and (after_created_at is null or (created_at, id) < (after_created_at, after_id))
      order by created_at desc, id desc limit 20
    ) n
    join private.posts p on p.id = n.post_id
  );
end;
$$;

create or replace function public.get_notifications(
  after_created_at timestamptz default null, after_id bigint default null
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.get_notifications(after_created_at, after_id);
$$;

revoke execute on function private.notification_actor_visible(uuid, uuid), private.notification_text(text),
  private.notify_post_commented(), private.notify_post_liked(), private.create_vote_ended_notifications(),
  private.delete_old_notifications() from public, anon, authenticated;
revoke execute on function private.get_notifications(timestamptz, bigint), public.get_notifications(timestamptz, bigint)
  from public, anon;
grant execute on function private.get_notifications(timestamptz, bigint), public.get_notifications(timestamptz, bigint)
  to authenticated;

select cron.schedule('notifications-vote-ended', '* * * * *', 'select private.create_vote_ended_notifications()');
select cron.schedule('notifications-cleanup', '0 18 * * *', 'select private.delete_old_notifications()');
