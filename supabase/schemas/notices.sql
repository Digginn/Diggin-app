-- #229 공지는 posts의 댓글·좋아요·신고 경로를 공유하고 관리자 API로만 작성한다.
create table private.notice_requests (
  request_id uuid primary key,
  admin_id uuid not null references private.admin_users(id),
  operation text not null,
  arguments jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index notice_requests_admin_idx on private.notice_requests(admin_id);
alter table private.notice_requests enable row level security;
revoke all on table private.notice_requests from public, anon, authenticated, service_role;

create or replace function private.normalize_notice()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.notice_title is not null then
    new.notice_title := normalize(btrim(new.notice_title), NFC);
    new.content := normalize(btrim(replace(replace(new.content, E'\r\n', E'\n'), E'\r', E'\n')), NFC);
    new.notice_inbox_body := normalize(btrim(new.notice_inbox_body), NFC);
  end if;
  return new;
end;
$$;
create trigger posts_normalize_notice before insert or update on private.posts
for each row execute function private.normalize_notice();

create or replace function private.notice_json(target_id bigint)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id::text, 'title', p.notice_title, 'body', p.content,
    'inbox_body', p.notice_inbox_body, 'inbox_only', p.notice_inbox_only,
    'comments_closed', p.notice_comments_closed, 'revision', p.notice_revision,
    'is_visible', p.hidden_at is null, 'created_at', p.created_at,
    'is_deleted', p.deleted_at is not null
  ) from private.posts p where p.id = target_id and p.notice_title is not null;
$$;

create or replace function private.admin_notice(
  actor uuid, actor_session uuid, operation text,
  target_id bigint default null, request_id uuid default null, payload jsonb default '{}'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target private.posts%rowtype;
  prior private.notice_requests%rowtype;
  arguments jsonb := jsonb_build_object('id',target_id,'payload',payload);
  result jsonb;
  page integer;
  title text;
  body text;
  inbox_body text;
  inbox_only boolean;
  comments_closed boolean;
begin
  perform private.assert_moderator(actor, actor_session);
  if operation = 'list' then
    page := coalesce((payload->>'page')::integer, 1);
    if page not between 1 and 100000 then raise exception 'invalid_notice_page' using errcode='22023'; end if;
    return jsonb_build_object(
      'total',(select count(*) from private.posts p where p.notice_title is not null and p.deleted_at is null),
      'rows',(select coalesce(jsonb_agg(private.notice_json(p.id) order by p.created_at desc,p.id desc),'[]')
        from (select p.id,p.created_at from private.posts p where p.notice_title is not null and p.deleted_at is null
          order by p.created_at desc,p.id desc limit 20 offset (page-1)*20) p)
    );
  end if;
  if operation = 'get' then
    result := private.notice_json(target_id);
    if result is null or (result->>'is_deleted')::boolean then raise exception 'notice_not_found' using errcode='P0002'; end if;
    return result;
  end if;
  if operation is null or operation not in ('create','update','visibility','delete') or request_id is null then
    raise exception 'invalid_notice_request' using errcode='22023';
  end if;
  -- 응답 유실·동시 재시도도 최초 요청의 결과를 돌려준다. 같은 UUID의 본문 변경은 거부한다.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,0));
  select * into prior from private.notice_requests r where r.request_id=admin_notice.request_id;
  if found then
    if prior.admin_id<>actor or prior.operation<>operation or prior.arguments<>arguments then
      raise exception 'notice_request_conflict' using errcode='P0001';
    end if;
    return prior.result;
  end if;
  if operation in ('create','update') then
    if jsonb_typeof(payload->'title') is distinct from 'string' or
       jsonb_typeof(payload->'body') is distinct from 'string' or
       jsonb_typeof(payload->'inbox_body') is distinct from 'string' or
       jsonb_typeof(payload->'inbox_only') is distinct from 'boolean' or
       jsonb_typeof(payload->'comments_closed') is distinct from 'boolean' then
      raise exception 'invalid_notice_content' using errcode='22023';
    end if;
    title := normalize(btrim(payload->>'title'),NFC);
    body := normalize(btrim(replace(replace(payload->>'body',E'\r\n',E'\n'),E'\r',E'\n')),NFC);
    inbox_body := normalize(btrim(payload->>'inbox_body'),NFC);
    inbox_only := (payload->>'inbox_only')::boolean;
    comments_closed := (payload->>'comments_closed')::boolean;
    if private.char_count(title) not between 1 and 100 or title ~ E'[\r\n]' or
       private.char_count(body) not between 1 and 10000 or body !~ '[^[:space:]]' or
       private.char_count(inbox_body)>200 then
      raise exception 'invalid_notice_content' using errcode='22023';
    end if;
  end if;
  if operation = 'create' then
    if target_id is not null then raise exception 'invalid_notice_request' using errcode='22023'; end if;
    insert into private.posts(author_id,type,content,creation_request_id,notice_title,notice_inbox_body,
      notice_inbox_only,notice_comments_closed)
    values(actor,'post',body,request_id,title,inbox_body,inbox_only,comments_closed) returning * into target;
  else
    select * into target from private.posts p where p.id=target_id and p.notice_title is not null for update;
    if not found or target.deleted_at is not null then raise exception 'notice_not_found' using errcode='P0002'; end if;
    if payload->>'revision' is distinct from target.notice_revision::text then
      raise exception 'notice_revision_conflict' using errcode='P0001';
    end if;
    if operation = 'update' then
      update private.posts set content=body,notice_title=title,notice_inbox_body=inbox_body,
        notice_inbox_only=inbox_only,notice_comments_closed=comments_closed,notice_revision=notice_revision+1
      where id=target.id;
    elsif operation = 'visibility' then
      if jsonb_typeof(payload->'is_visible') is distinct from 'boolean' then
        raise exception 'invalid_notice_visibility' using errcode='22023';
      end if;
      update private.posts set hidden_at=case when (payload->>'is_visible')::boolean then null else now() end,
        hidden_by=case when (payload->>'is_visible')::boolean then null else actor end,
        notice_revision=notice_revision+1 where id=target.id;
    else
      update private.posts set deleted_at=now(),notice_revision=notice_revision+1 where id=target.id;
    end if;
  end if;
  result := private.notice_json(target.id);
  insert into private.notice_requests(request_id,admin_id,operation,arguments,result)
  values(request_id,actor,operation,arguments,result);
  return result;
end;
$$;

create or replace function public.admin_notice(
  actor uuid, actor_session uuid, operation text,
  target_id bigint default null, request_id uuid default null, payload jsonb default '{}'
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_notice(actor,actor_session,operation,target_id,request_id,payload);
$$;

create or replace function private.get_featured_notice()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then perform private.assert_account_access(); end if;
  return (select jsonb_build_object('id',p.id::text,'title',p.notice_title) from private.posts p
    where p.notice_title is not null and not p.notice_inbox_only and p.deleted_at is null and p.hidden_at is null
      and private.community_author_visible(p.author_id) and private.community_content_visible('post',p.id)
    order by p.created_at desc,p.id desc limit 1);
end;
$$;
create or replace function public.get_featured_notice()
returns jsonb language sql security invoker set search_path = '' as $$ select private.get_featured_notice(); $$;

-- 새 버전 앱만 새 계약을 사용한다. 기존 get_notifications의 bigint 커서와 응답은 유지한다.
create or replace function private.get_app_notifications(after_created_at timestamptz default null, after_key text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare viewer_id uuid := private.notification_viewer();
begin
  if (after_created_at is null)<>(after_key is null) or
    (after_key is not null and after_key !~ '^(notice:)?[1-9][0-9]{0,18}$') then
    raise exception 'invalid_notification_cursor' using errcode='22023';
  end if;
  return (with entries as (
    select n.id::text as key,n.created_at,jsonb_build_object(
      'id',n.id::text,'title',n.title,'body',n.body,'created_at',n.created_at,
      'post_id',p.id::text,'post_type',p.type,'comment_id',n.comment_id::text,'is_post_available',
      p.deleted_at is null and p.hidden_at is null and private.community_author_visible(p.author_id)
      and private.community_content_visible('post',p.id)) as data
    from private.notifications n join private.posts p on p.id=n.post_id
    where n.recipient_id=viewer_id and n.created_at>now()-interval '30 days'
      and (n.actor_id is null or private.notification_actor_visible(viewer_id,n.actor_id))
    union all
    select 'notice:'||p.id::text,p.created_at,jsonb_build_object(
      'id','notice:'||p.id::text,'title',p.notice_title,
      'body',coalesce(nullif(p.notice_inbox_body,''),p.content),'created_at',p.created_at,
      'post_id',p.id::text,'post_type','notice','is_post_available',true)
    from private.posts p where p.notice_title is not null and p.deleted_at is null and p.hidden_at is null
      and p.created_at>now()-interval '30 days'
      and private.community_author_visible(p.author_id) and private.community_content_visible('post',p.id)
  ) select coalesce(jsonb_agg(e.data order by e.created_at desc,e.key collate "C" desc),'[]')
    from (select * from entries where after_created_at is null or
      (created_at,key collate "C")<(after_created_at,after_key collate "C")
      order by created_at desc,key collate "C" desc limit 20) e);
end;
$$;
create or replace function public.get_app_notifications(after_created_at timestamptz default null, after_key text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.get_app_notifications(after_created_at,after_key);
$$;

create or replace function private.has_unread_notices()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare viewer_id uuid := private.notification_viewer();
begin
  return exists(select 1 from private.posts p where p.notice_title is not null
    and p.hidden_at is null and p.deleted_at is null and p.created_at>now()-interval '30 days'
    and private.community_author_visible(p.author_id) and private.community_content_visible('post',p.id)
    and p.created_at>coalesce((select c.checked_at from private.notification_checks c where c.user_id=viewer_id),'-infinity'));
end;
$$;
create or replace function public.has_unread_notices()
returns boolean language sql security invoker set search_path = '' as $$ select private.has_unread_notices(); $$;

revoke execute on function private.normalize_notice(),private.notice_json(bigint) from public,anon,authenticated,service_role;
revoke execute on function private.admin_notice(uuid,uuid,text,bigint,uuid,jsonb),
  public.admin_notice(uuid,uuid,text,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.admin_notice(uuid,uuid,text,bigint,uuid,jsonb),
  public.admin_notice(uuid,uuid,text,bigint,uuid,jsonb) to service_role;
revoke execute on function private.get_featured_notice(),public.get_featured_notice() from public;
grant execute on function private.get_featured_notice(),public.get_featured_notice() to anon,authenticated;
revoke execute on function private.get_app_notifications(timestamptz,text),public.get_app_notifications(timestamptz,text),
  private.has_unread_notices(),public.has_unread_notices() from public,anon;
grant execute on function private.get_app_notifications(timestamptz,text),public.get_app_notifications(timestamptz,text),
  private.has_unread_notices(),public.has_unread_notices() to authenticated;
