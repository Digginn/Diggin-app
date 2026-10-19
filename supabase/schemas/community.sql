-- #94 읽기 기반. 쓰기는 후속 RPC에서만 허용하며 private 원본은 앱에 공개하지 않는다.
create table private.posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  type public.post_type not null,
  content text not null,
  ends_at timestamptz,
  deleted_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  next_anon_number integer not null default 1 check (next_anon_number > 0),
  constraint posts_content_length check (
    private.char_count(regexp_replace(content, '[[:space:]]', '', 'g')) between 5 and 50
  ),
  constraint posts_vote_end check (
    (type = 'post' and ends_at is null) or
    (type = 'vote' and ends_at is not null and ends_at = created_at + interval '24 hours')
  )
);
create index posts_feed_idx on private.posts(created_at desc, id desc)
  where deleted_at is null and hidden_at is null;
create index posts_vote_feed_idx on private.posts(created_at desc, id desc)
  where type = 'vote' and deleted_at is null and hidden_at is null;
create index posts_author_idx on private.posts(author_id, created_at desc, id desc);

create table private.post_products (
  post_id bigint not null references private.posts(id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  name text not null,
  brand text,
  price integer check (price >= 0),
  url text not null check (url ~* '^https://'),
  image_url text,
  primary key (post_id, position)
);

create table private.vote_responses (
  id bigint generated always as identity primary key,
  post_id bigint not null references private.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  choice public.vote_choice not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index vote_responses_user_idx on private.vote_responses(user_id);

create table private.post_likes (
  id bigint generated always as identity primary key,
  post_id bigint not null references private.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index post_likes_user_idx on private.post_likes(user_id, created_at desc);

create table private.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references private.posts(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  content text check (content is null or private.char_count(content) between 1 and 30),
  deleted_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_post_idx on private.comments(post_id, created_at, id)
  where deleted_at is null and hidden_at is null;
create index comments_author_idx on private.comments(author_id);

create table private.post_anon_numbers (
  post_id bigint not null references private.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  number integer not null check (number > 0),
  primary key (post_id, user_id),
  unique (post_id, number)
);
create index post_anon_numbers_user_idx on private.post_anon_numbers(user_id);

-- 신고·차단 쓰기/운영 API는 별도 작업. 조회 제외의 서버 기준 테이블을 먼저 정의한다.
create table private.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on private.user_blocks(blocked_id);

create table private.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type public.report_target not null,
  post_id bigint references private.posts(id) on delete cascade,
  comment_id bigint references private.comments(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  reason public.report_reason not null,
  detail text check (detail is null or private.char_count(detail) <= 50),
  reported_content text,
  status public.report_status not null default 'received',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((target_type = 'post' and post_id is not null and comment_id is null) or
    (target_type = 'comment' and comment_id is not null and post_id is null)),
  check (reason = 'other' or detail is null),
  unique (reporter_id, post_id),
  unique (reporter_id, comment_id)
);
create index reports_author_idx on private.reports(reporter_id, reported_user_id);
create index reports_reported_user_idx on private.reports(reported_user_id);
create index reports_post_idx on private.reports(post_id);
create index reports_comment_idx on private.reports(comment_id);

alter table private.posts enable row level security;
alter table private.post_products enable row level security;
alter table private.vote_responses enable row level security;
alter table private.post_likes enable row level security;
alter table private.comments enable row level security;
alter table private.post_anon_numbers enable row level security;
alter table private.user_blocks enable row level security;
alter table private.reports enable row level security;
revoke all on table private.posts, private.post_products, private.vote_responses,
  private.post_likes, private.comments, private.post_anon_numbers,
  private.user_blocks, private.reports from public, anon, authenticated;
revoke all on sequence private.posts_id_seq, private.vote_responses_id_seq,
  private.post_likes_id_seq, private.comments_id_seq, private.reports_id_seq
  from public, anon, authenticated;

create or replace function private.assert_can_write_community()
returns void language plpgsql security definer set search_path = '' as $$
declare
  viewer_id uuid := (select auth.uid());
  profile public.profiles%rowtype;
begin
  if viewer_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into profile from public.profiles where id = viewer_id;
  if not found or profile.status = 'suspended' or
    (profile.status = 'community_restricted' and profile.restricted_until > now()) then
    raise exception 'community_restricted' using errcode = '42501';
  end if;
end;
$$;

-- 호출자가 전달한 viewer ID를 받지 않고 auth.uid()로만 조회 범위를 정한다.
create or replace function private.community_author_visible(target_author_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select not exists (
    select 1 from private.user_blocks b
    where b.blocker_id = (select auth.uid()) and b.blocked_id = target_author_id
  ) and not exists (
    select 1 from private.reports r
    where r.reporter_id = (select auth.uid()) and r.reported_user_id = target_author_id
  );
$$;

create or replace function private.community_post_json(target_post_id bigint, is_preview boolean)
returns jsonb language sql stable set search_path = '' as $$
  select case when is_preview then jsonb_build_object(
    'id', p.id::text, 'type', p.type, 'created_at', p.created_at,
    'content', split_part(replace(p.content, E'\r', ''), E'\n', 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'position', i.position, 'image_url', i.image_url) order by i.position)
      from private.post_products i where i.post_id = p.id), '[]'::jsonb)
  ) else jsonb_build_object(
    'id', p.id::text, 'type', p.type, 'created_at', p.created_at, 'ends_at', p.ends_at,
    'server_now', now(), 'content', p.content, 'is_mine', p.author_id = (select auth.uid()),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'position', i.position, 'name', i.name, 'brand', i.brand, 'price', i.price,
      'url', i.url, 'image_url', i.image_url) order by i.position)
      from private.post_products i where i.post_id = p.id), '[]'::jsonb),
    'like_count', (select count(*) from private.post_likes l where l.post_id = p.id),
    'is_liked', exists(select 1 from private.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
    'comment_count', (select count(*) from private.comments c where c.post_id = p.id
      and c.deleted_at is null and c.hidden_at is null and private.community_author_visible(c.author_id)),
    'my_choice', (select v.choice from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid())),
    'buy_count', case when exists(select 1 from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid()))
      then (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'buy') else null end,
    'not_count', case when exists(select 1 from private.vote_responses v where v.post_id = p.id and v.user_id = (select auth.uid()))
      then (select count(*) from private.vote_responses v where v.post_id = p.id and v.choice = 'not') else null end
  ) end
  from private.posts p where p.id = target_post_id;
$$;

create or replace function private.get_community_feed(
  feed_type text default 'all', after_created_at timestamptz default null, after_id bigint default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer_id uuid := (select auth.uid());
begin
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
        and (after_created_at is null or (p.created_at, p.id) < (after_created_at, after_id))
      order by p.created_at desc, p.id desc limit 20
    ) p
  );
end;
$$;

create or replace function private.get_community_post(target_post_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.profiles where id = (select auth.uid()) and status <> 'suspended'
  ) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return (
    select private.community_post_json(p.id, false) from private.posts p
    where p.id = target_post_id and p.deleted_at is null and p.hidden_at is null
      and private.community_author_visible(p.author_id)
  );
end;
$$;

create or replace function private.get_community_comments(
  target_post_id bigint, after_created_at timestamptz default null, after_id bigint default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if private.get_community_post(target_post_id) is null then return '[]'::jsonb; end if;
  if (after_created_at is null) <> (after_id is null) then
    raise exception 'invalid_comment_cursor' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id::text, 'created_at', c.created_at,
      'content', case when c.author_id is null then null else c.content end,
      'is_post_author', c.author_id = p.author_id,
      'is_mine', c.author_id = (select auth.uid()), 'is_withdrawn', c.author_id is null,
      'anon_number', a.number
    ) order by c.created_at, c.id), '[]'::jsonb)
    from (
      select c.* from private.comments c
      where c.post_id = target_post_id and c.deleted_at is null and c.hidden_at is null
        and private.community_author_visible(c.author_id)
        and (after_created_at is null or (c.created_at, c.id) > (after_created_at, after_id))
      order by c.created_at, c.id limit 20
    ) c
    join private.posts p on p.id = c.post_id
    left join private.post_anon_numbers a on a.post_id = c.post_id and a.user_id = c.author_id
  );
end;
$$;

create or replace function public.get_community_feed(
  feed_type text default 'all', after_created_at timestamptz default null, after_id bigint default null
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.get_community_feed(feed_type, after_created_at, after_id);
$$;
create or replace function public.get_community_post(target_post_id bigint)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.get_community_post(target_post_id);
$$;
create or replace function public.get_community_comments(
  target_post_id bigint, after_created_at timestamptz default null, after_id bigint default null
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.get_community_comments(target_post_id, after_created_at, after_id);
$$;

revoke execute on function private.assert_can_write_community() from public, anon, authenticated;
revoke execute on function private.community_author_visible(uuid) from public, anon, authenticated;
revoke execute on function private.community_post_json(bigint, boolean) from public, anon, authenticated;
revoke execute on function private.get_community_feed(text, timestamptz, bigint) from public, anon, authenticated;
revoke execute on function private.get_community_post(bigint) from public, anon, authenticated;
revoke execute on function private.get_community_comments(bigint, timestamptz, bigint) from public, anon, authenticated;
revoke execute on function public.get_community_feed(text, timestamptz, bigint) from public, anon, authenticated;
revoke execute on function public.get_community_post(bigint) from public, anon, authenticated;
revoke execute on function public.get_community_comments(bigint, timestamptz, bigint) from public, anon, authenticated;
-- public wrapper에서 private 함수를 찾는 데 필요한 usage만 허용한다. 테이블 권한은 없다.
grant usage on schema private to anon;
grant execute on function private.get_community_feed(text, timestamptz, bigint) to anon, authenticated;
grant execute on function public.get_community_feed(text, timestamptz, bigint) to anon, authenticated;
grant execute on function private.get_community_post(bigint) to authenticated;
grant execute on function public.get_community_post(bigint) to authenticated;
grant execute on function private.get_community_comments(bigint, timestamptz, bigint) to authenticated;
grant execute on function public.get_community_comments(bigint, timestamptz, bigint) to authenticated;
