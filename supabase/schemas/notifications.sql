-- #104 알림. 원본은 private에 두고 목록 RPC로만 읽는다. 알림을 누를 때 글이 지워졌는지(NOTI-006)를
-- 앱이 private.posts를 보지 않고 알 수 있어야 해서 public 테이블 대신 RPC로 함께 내려준다.
create extension if not exists pg_cron with schema pg_catalog;

create table private.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  post_id bigint not null references private.posts(id) on delete cascade,
  -- NOTI-011 댓글 좋아요 알림은 누르면 이 댓글로 스크롤한다. 다른 알림은 비워 둔다.
  comment_id bigint references private.comments(id) on delete cascade,
  -- 댓글·좋아요를 한 사람. 나중에 차단·신고하면 목록과 새 알림 점에서 뺀다. 투표 마감은 없다.
  actor_id uuid references public.profiles(id) on delete set null,
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
create index notifications_actor_idx on private.notifications(actor_id);
create index notifications_comment_idx on private.notifications(comment_id) where comment_id is not null;

-- 좋아요는 취소 후 다시 눌러도 같은 사람·같은 글에 한 번만 알린다. 취소해도 지우지 않는다.
create table private.like_notification_log (
  post_id bigint not null references private.posts(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, actor_id)
);
create index like_notification_log_actor_idx on private.like_notification_log(actor_id);

-- NOTI-005 좋아요 10개 알림 발송 이력. 알림은 30일 뒤 지워져도 이 기록이 남아 게시글당 한 번만 보낸다.
create table private.post_like_notifications (
  post_id bigint primary key references private.posts(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- NOTI-011 댓글·답글 좋아요 10개 알림 발송 이력. 댓글당 한 번만 보낸다.
create table private.comment_like_notifications (
  comment_id bigint primary key references private.comments(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 알림함을 마지막으로 연 시각. 이보다 뒤에 온 알림이 안 읽은 알림이다(종 아이콘 점, 목록 Gray50 배경).
-- 알림마다 읽음을 두지 않고 열면 전부 읽음으로 본다(개인정보처리방침 "알림함 마지막 확인 시각").
create table private.notification_checks (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  checked_at timestamptz not null default now()
);

-- MY-011 Push 수신 여부. 행이 없으면 켜진 것으로 본다. 꺼도 알림함에는 계속 쌓이고(NOTI-007) Push만 보내지 않는다.
create table private.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table private.notifications enable row level security;
alter table private.like_notification_log enable row level security;
alter table private.post_like_notifications enable row level security;
alter table private.comment_like_notifications enable row level security;
alter table private.notification_checks enable row level security;
alter table private.notification_settings enable row level security;
revoke all on table private.notifications, private.like_notification_log, private.post_like_notifications,
  private.comment_like_notifications, private.notification_checks, private.notification_settings
  from public, anon, authenticated;
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

-- 알림 본문에 넣을 인용. 길면 앞부분만 남기고 ...을 붙인다. 잘린 끝에 걸린 이모지는 깨지지 않게 그 이모지부터 뺀다.
create or replace function private.notification_excerpt(value text, max_length integer)
returns text language sql immutable set search_path = '' as $$
  select case when char_length(private.notification_text(value)) > max_length
    then rtrim(regexp_replace(left(private.notification_text(value), max_length),
      '[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u21AA\u231A-\u23FF\u24C2\u25AA-\u27BF\u2934\u2935\u2B05-\u2B55\u3030\u303D\u3297\u3299\uFE0F\u200D\U0001F000-\U0001FAFF\U000E0020-\U000E007F]+$', '')) || '...'
    else private.notification_text(value) end;
$$;

-- NOTI-004 내 일반 게시글에 다른 사람이 댓글을 처음 등록했을 때. 재시도는 기존 댓글을 돌려주고 insert가 없다.
-- NOTI-010 답글은 글쓴이가 아니라 원 댓글 작성자에게만 알린다. 투표글 답글도 알린다.
create or replace function private.notify_post_commented()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target private.posts%rowtype;
  actor_nickname text;
  recipient uuid;
begin
  select * into target from private.posts where id = new.post_id;
  if target.deleted_at is not null or target.hidden_at is not null or new.author_id is null or
     (new.parent_id is null and (target.type <> 'post' or target.notice_title is not null)) then
    return new;
  end if;
  if new.parent_id is null then recipient := target.author_id;
  else select author_id into recipient from private.comments where id = new.parent_id;
  end if;
  if recipient is null or recipient = new.author_id or
     not private.notification_actor_visible(recipient, new.author_id) then
    return new;
  end if;
  select nickname into actor_nickname from public.profiles where id = new.author_id;
  insert into private.notifications(recipient_id, type, post_id, actor_id, title, body, event_key)
  values (recipient, 'post_commented', target.id, new.author_id,
          case when new.parent_id is null then '내 게시글에 댓글이 달렸어요.' else '내 댓글에 답글이 달렸어요.' end,
          coalesce(actor_nickname, '사용자') || ': ' || private.notification_text(new.content),
          case when new.parent_id is null then 'comment:' else 'reply:' end || new.id)
  on conflict (event_key) do nothing;
  return new;
end;
$$;

-- NOTI-005 좋아요는 하나씩 알리지 않고, 내 일반 게시글의 좋아요가 처음 10개가 됐을 때 한 번만 알린다.
-- 좋아요 쓰기는 글 행을 잠가 줄을 세우므로 10번째 좋아요를 동시에 놓치지 않는다.
-- 취소 후 다시 10개가 돼도 발송 이력(post_like_notifications)으로 게시글당 한 번만 만든다.
create or replace function private.notify_post_liked()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target private.posts%rowtype;
begin
  select * into target from private.posts where id = new.post_id;
  if target.notice_title is not null or target.type <> 'post' or target.deleted_at is not null or
     target.hidden_at is not null or (select count(*) from private.post_likes l where l.post_id = new.post_id) <> 10 then
    return new;
  end if;
  insert into private.post_like_notifications(post_id) values (target.id) on conflict do nothing;
  if not found then return new; end if;
  -- 목록과 Push 본문은 글 앞 20자에 안내 문장을 붙인다.
  insert into private.notifications(recipient_id, type, post_id, title, body, event_key)
  values (target.author_id, 'post_liked', target.id, '내 게시글에 10개 이상의 좋아요가 달렸어요.',
          '''' || private.notification_excerpt(target.content, 20) || ''' 게시글에 달린 좋아요를 확인해 보세요.',
          'like10:' || target.id)
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

-- NOTI-011 내 댓글·답글의 좋아요가 처음 10개가 되면 한 번 알린다. 일반글·투표글·공지 댓글 모두 해당한다.
-- 댓글 좋아요 쓰기는 댓글 행을 잠가 줄을 세우므로 10번째를 동시에 놓치지 않는다. 발송 이력으로 댓글당 한 번만 만든다.
-- 문구는 Figma 시안이 없어 게시글 좋아요(MSG-NOTI-003)를 따랐다.
create or replace function private.notify_comment_liked()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target private.comments%rowtype;
begin
  select * into target from private.comments where id = new.comment_id;
  if target.author_id is null or target.deleted_at is not null or target.hidden_at is not null or
     exists(select 1 from private.posts p where p.id = target.post_id and (p.deleted_at is not null or p.hidden_at is not null)) or
     (select count(*) from private.comment_likes l where l.comment_id = new.comment_id) <> 10 then
    return new;
  end if;
  insert into private.comment_like_notifications(comment_id) values (target.id) on conflict do nothing;
  if not found then return new; end if;
  insert into private.notifications(recipient_id, type, post_id, comment_id, title, body, event_key)
  values (target.author_id, 'comment_liked', target.post_id, target.id, '내 댓글에 10개 이상의 좋아요가 달렸어요.',
          '''' || private.notification_excerpt(target.content, 20) || ''' 댓글에 달린 좋아요를 확인해 보세요.',
          'commentlike10:' || target.id)
  on conflict (event_key) do nothing;
  return new;
end;
$$;

create trigger comment_likes_notify_author
after insert on private.comment_likes
for each row execute function private.notify_comment_liked();

-- NOTI-003 마감된 투표를 작성자에게 한 번 알린다. 알림을 만들 때 지워졌거나 숨겨진 투표는 알리지 않는다.
-- 삭제 시 투표 응답도 지워져(VOTE-012) 보여 줄 결과가 없다. 알림을 받은 뒤 지워지면 누를 때 NOTI-006 안내를 띄운다.
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

create or replace function private.notification_viewer()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  viewer_id uuid := (select auth.uid());
begin
  if viewer_id is null or not exists (
    select 1 from public.profiles where id = viewer_id and status <> 'suspended'
  ) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return viewer_id;
end;
$$;

-- NOTI-007 최근 30일 알림을 최신순으로 20개씩 준다. 알림은 항상 받는 사람 자신의 글이라
-- 글이 지워졌거나 숨겨졌는지만 알려 주고, 앱은 누를 때 삭제 안내(NOTI-006)를 띄운다.
create or replace function private.get_notifications(
  after_created_at timestamptz default null, after_id bigint default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer_id uuid := private.notification_viewer();
begin
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
      select * from private.notifications n
      where n.recipient_id = viewer_id and n.created_at > now() - interval '30 days'
        and (n.actor_id is null or private.notification_actor_visible(viewer_id, n.actor_id))
        and (after_created_at is null or (n.created_at, n.id) < (after_created_at, after_id))
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

-- 종 아이콘 빨간 점. 목록에 보이는 최근 30일 알림 중 마지막 확인 뒤에 온 것이 있는지 본다.
create or replace function private.has_unread_notifications()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  viewer_id uuid := private.notification_viewer();
begin
  return exists (
    select 1 from private.notifications n
    where n.recipient_id = viewer_id and n.created_at > now() - interval '30 days'
      and (n.actor_id is null or private.notification_actor_visible(viewer_id, n.actor_id))
      and n.created_at > coalesce(
        (select c.checked_at from private.notification_checks c where c.user_id = viewer_id), '-infinity')
  );
end;
$$;

-- 알림함을 열 때 부른다. 확인 시각을 지금으로 바꾸고, 이번에 회색으로 보여 줄 기준인 이전 시각을 돌려준다.
create or replace function private.mark_notifications_checked()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  viewer_id uuid := private.notification_viewer();
  previous timestamptz;
begin
  select checked_at into previous from private.notification_checks where user_id = viewer_id for update;
  insert into private.notification_checks(user_id, checked_at) values (viewer_id, now())
  on conflict (user_id) do update set checked_at = excluded.checked_at;
  return previous;
end;
$$;

create or replace function private.get_push_enabled()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  viewer_id uuid := private.notification_viewer();
begin
  return coalesce((select s.push_enabled from private.notification_settings s where s.user_id = viewer_id), true);
end;
$$;

create or replace function private.set_push_enabled(enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  viewer_id uuid := private.notification_viewer();
begin
  if enabled is null then
    raise exception 'invalid_push_enabled' using errcode = '22023';
  end if;
  insert into private.notification_settings(user_id, push_enabled) values (viewer_id, enabled)
  on conflict (user_id) do update set push_enabled = excluded.push_enabled, updated_at = now();
  return enabled;
end;
$$;

create or replace function public.get_push_enabled()
returns boolean language sql security invoker set search_path = '' as $$
  select private.get_push_enabled();
$$;

create or replace function public.set_push_enabled(enabled boolean)
returns boolean language sql security invoker set search_path = '' as $$
  select private.set_push_enabled(enabled);
$$;

create or replace function public.has_unread_notifications()
returns boolean language sql security invoker set search_path = '' as $$
  select private.has_unread_notifications();
$$;

create or replace function public.mark_notifications_checked()
returns timestamptz language sql security invoker set search_path = '' as $$
  select private.mark_notifications_checked();
$$;

revoke execute on function private.notification_actor_visible(uuid, uuid), private.notification_text(text),
  private.notification_excerpt(text, integer), private.notify_comment_liked(),
  private.notify_post_commented(), private.notify_post_liked(), private.create_vote_ended_notifications(),
  private.delete_old_notifications(), private.notification_viewer() from public, anon, authenticated;
revoke execute on function private.get_notifications(timestamptz, bigint), public.get_notifications(timestamptz, bigint),
  private.has_unread_notifications(), public.has_unread_notifications(),
  private.mark_notifications_checked(), public.mark_notifications_checked(),
  private.get_push_enabled(), public.get_push_enabled(),
  private.set_push_enabled(boolean), public.set_push_enabled(boolean)
  from public, anon;
grant execute on function private.get_notifications(timestamptz, bigint), public.get_notifications(timestamptz, bigint),
  private.has_unread_notifications(), public.has_unread_notifications(),
  private.mark_notifications_checked(), public.mark_notifications_checked(),
  private.get_push_enabled(), public.get_push_enabled(),
  private.set_push_enabled(boolean), public.set_push_enabled(boolean)
  to authenticated;

select cron.schedule('notifications-vote-ended', '* * * * *', 'select private.create_vote_ended_notifications()');
select cron.schedule('notifications-cleanup', '0 18 * * *', 'select private.delete_old_notifications()');
