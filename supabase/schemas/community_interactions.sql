-- #97: 댓글·좋아요 쓰기는 부모 글 잠금 → 댓글/좋아요 변경 순서를 공유한다.
create or replace function private.lock_community_post_for_write(target_post_id bigint)
returns private.posts language plpgsql set search_path = '' as $$
declare
  target private.posts%rowtype;
begin
  perform private.assert_can_write_community();
  select * into target from private.posts where id = target_post_id for update;
  if not found or target.deleted_at is not null or target.hidden_at is not null or
     not private.community_author_visible(target.author_id) or
     not private.community_content_visible('post', target.id) then
    raise exception 'post_not_found' using errcode = '42501';
  end if;
  return target;
end;
$$;

create or replace function private.community_comment_json(target_comment_id bigint)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id::text, 'created_at', c.created_at,
    'content', case when c.author_id is null then null else c.content end,
    'is_post_author', c.author_id = p.author_id,
    'is_mine', c.author_id = (select auth.uid()), 'is_withdrawn', c.author_id is null,
    'anon_number', a.number, 'author_nickname', author.nickname,
    'is_operator', operator.id is not null,
    'vote_choice', vote.choice,
    'parent_id', c.parent_id::text,
    'like_count', (select count(*) from private.comment_likes l where l.comment_id = c.id),
    'is_liked', exists(select 1 from private.comment_likes l where l.comment_id = c.id and l.user_id = (select auth.uid()))
  ) from private.comments c join private.posts p on p.id = c.post_id
  left join public.profiles author on author.id = c.author_id
  left join private.post_anon_numbers a on a.post_id = c.post_id and a.user_id = c.author_id
  left join private.admin_users operator on operator.id = c.author_id and operator.disabled_at is null
  left join private.vote_responses vote on p.type = 'vote' and vote.post_id = c.post_id and vote.user_id = c.author_id
  where c.id = target_comment_id;
$$;

create or replace function private.normalize_comment_content(comment_content text)
returns text language plpgsql stable set search_path = '' as $$
declare
  clean_content text := normalize(replace(replace(comment_content, E'\r\n', E'\n'), E'\r', E'\n'), NFC);
begin
  if clean_content is null or private.char_count(clean_content) not between 1 and 150 or
     regexp_replace(clean_content, U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]', '', 'g') = '' then
    raise exception 'invalid_comment_content' using errcode = '22023';
  end if;
  if private.contains_community_profanity(clean_content) then
    raise exception 'community_profanity' using errcode = '22023';
  end if;
  return clean_content;
end;
$$;

-- parent_comment_id를 주면 답글(CMT-09)이다. 원 댓글에만 달 수 있고 답글에는 달 수 없다.
create or replace function private.create_comment(
  target_post_id bigint, comment_content text, request_id uuid, parent_comment_id bigint default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target private.posts%rowtype;
  viewer_id uuid := (select auth.uid());
  existing private.comments%rowtype;
  parent private.comments%rowtype;
  clean_content text;
  anon_number integer;
  saved_id bigint;
begin
  -- 글 잠금을 먼저 잡아 원 댓글 삭제와 답글 등록을 줄 세운다.
  target := private.lock_community_post_for_write(target_post_id);
  if target.notice_title is not null and target.notice_comments_closed then
    raise exception 'notice_comments_closed' using errcode='P0001';
  end if;
  if request_id is null then raise exception 'invalid_request_id' using errcode = '22023'; end if;
  select * into existing from private.comments where author_id = viewer_id and creation_request_id = request_id;
  if found then
    if existing.post_id <> target.id or existing.parent_id is distinct from parent_comment_id then
      raise exception 'invalid_request_id' using errcode = '22023';
    end if;
    if existing.deleted_at is not null or existing.hidden_at is not null then
      raise exception 'comment_not_found' using errcode = '42501';
    end if;
    return private.community_comment_json(existing.id);
  end if;
  if parent_comment_id is not null then
    select * into parent from private.comments where id = parent_comment_id and post_id = target.id;
    if not found or not private.community_comment_listed(parent.id) then
      raise exception 'comment_not_found' using errcode = '42501';
    end if;
    if parent.parent_id is not null then raise exception 'invalid_reply_target' using errcode = '22023'; end if;
  end if;
  clean_content := private.normalize_comment_content(comment_content);
  if viewer_id <> target.author_id then
    select number into anon_number from private.post_anon_numbers where post_id = target.id and user_id = viewer_id;
    if anon_number is null then
      update private.posts set next_anon_number = next_anon_number + 1 where id = target.id
      returning next_anon_number - 1 into anon_number;
      insert into private.post_anon_numbers(post_id, user_id, number) values (target.id, viewer_id, anon_number);
    end if;
  end if;
  insert into private.comments(post_id, parent_id, author_id, content, creation_request_id)
  values (target.id, parent_comment_id, viewer_id, clean_content, request_id) returning id into saved_id;
  return private.community_comment_json(saved_id);
end;
$$;

create or replace function private.update_comment(target_comment_id bigint, comment_content text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  parent_id bigint;
  clean_content text;
begin
  perform private.assert_can_write_community();
  select post_id into parent_id from private.comments where id = target_comment_id and author_id = (select auth.uid());
  if not found then raise exception 'comment_not_found' using errcode = '42501'; end if;
  perform private.lock_community_post_for_write(parent_id);
  if exists(select 1 from private.posts p where p.id=parent_id and p.notice_title is not null and p.notice_comments_closed) then
    raise exception 'notice_comments_closed' using errcode='P0001';
  end if;
  clean_content := private.normalize_comment_content(comment_content);
  update private.comments set content = clean_content, updated_at = now()
  where id = target_comment_id and author_id = (select auth.uid()) and deleted_at is null and hidden_at is null;
  if not found then raise exception 'comment_not_found' using errcode = '42501'; end if;
  return private.community_comment_json(target_comment_id);
end;
$$;

create or replace function private.delete_comment(target_comment_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  parent_id bigint;
begin
  perform private.assert_can_write_community();
  select post_id into parent_id from private.comments where id = target_comment_id and author_id = (select auth.uid());
  if not found then raise exception 'comment_not_found' using errcode = '42501'; end if;
  perform private.lock_community_post_for_write(parent_id);
  update private.comments set deleted_at = coalesce(deleted_at, now())
  where id = target_comment_id and author_id = (select auth.uid());
end;
$$;

-- 토글 대신 원하는 상태를 받는다. 응답 유실 후 재시도해도 반대로 뒤집히지 않는다.
create or replace function private.set_community_like(target_post_id bigint, is_liked boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target private.posts%rowtype;
begin
  target := private.lock_community_post_for_write(target_post_id);
  if target.type <> 'post' then raise exception 'invalid_post_type' using errcode = '22023'; end if;
  if is_liked is null then raise exception 'invalid_like_state' using errcode = '22023'; end if;
  if is_liked then
    -- 본인 글 좋아요는 막는다(BUG-074). 취소는 예전에 눌러 둔 좋아요를 지울 수 있게 허용한다.
    if target.author_id = (select auth.uid()) then
      raise exception 'own_post_like' using errcode = '42501';
    end if;
    insert into private.post_likes(post_id, user_id) values (target.id, (select auth.uid())) on conflict do nothing;
  else
    delete from private.post_likes where post_id = target.id and user_id = (select auth.uid());
  end if;
  return jsonb_build_object('is_liked', is_liked, 'like_count', (select count(*) from private.post_likes where post_id = target.id));
end;
$$;

-- LIKE-004 댓글·답글 좋아요. 알림은 보내지 않고 본인 댓글은 누를 수 없다.
create or replace function private.set_comment_like(target_comment_id bigint, is_liked boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  parent_id bigint;
  target private.comments%rowtype;
begin
  if is_liked is null then raise exception 'invalid_like_state' using errcode = '22023'; end if;
  select c.post_id into parent_id from private.comments c where c.id = target_comment_id;
  if not found then raise exception 'comment_not_found' using errcode = '42501'; end if;
  -- 댓글 수정·삭제와 같은 부모 글 → 댓글 잠금 순서를 따른다.
  perform private.lock_community_post_for_write(parent_id);
  if exists(select 1 from private.posts p where p.id = parent_id and p.notice_title is not null and p.notice_comments_closed) then
    raise exception 'notice_comments_closed' using errcode = 'P0001';
  end if;
  select * into target from private.comments where id = target_comment_id for update;
  if is_liked then
    if target.author_id is null or not private.community_comment_listed(target.id) then
      raise exception 'comment_not_found' using errcode = '42501';
    end if;
    if target.author_id = (select auth.uid()) then
      raise exception 'own_comment_like' using errcode = '42501';
    end if;
    insert into private.comment_likes(comment_id, user_id) values (target.id, (select auth.uid())) on conflict do nothing;
  else
    delete from private.comment_likes where comment_id = target.id and user_id = (select auth.uid());
  end if;
  return jsonb_build_object('is_liked', is_liked,
    'like_count', (select count(*) from private.comment_likes where comment_id = target.id));
end;
$$;

create or replace function public.create_comment(
  target_post_id bigint, comment_content text, request_id uuid, parent_comment_id bigint default null
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.create_comment(target_post_id, comment_content, request_id, parent_comment_id);
$$;
create or replace function public.update_comment(target_comment_id bigint, comment_content text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.update_comment(target_comment_id, comment_content);
$$;
create or replace function public.delete_comment(target_comment_id bigint)
returns void language sql security invoker set search_path = '' as $$
  select private.delete_comment(target_comment_id);
$$;
create or replace function public.set_community_like(target_post_id bigint, is_liked boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_community_like(target_post_id, is_liked);
$$;
create or replace function public.set_comment_like(target_comment_id bigint, is_liked boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_comment_like(target_comment_id, is_liked);
$$;

revoke execute on function private.lock_community_post_for_write(bigint), private.community_comment_json(bigint),
 private.normalize_comment_content(text) from public, anon, authenticated;
revoke execute on function private.create_comment(bigint, text, uuid, bigint), public.create_comment(bigint, text, uuid, bigint),
 private.update_comment(bigint, text), public.update_comment(bigint, text),
 private.delete_comment(bigint), public.delete_comment(bigint),
 private.set_community_like(bigint, boolean), public.set_community_like(bigint, boolean),
 private.set_comment_like(bigint, boolean), public.set_comment_like(bigint, boolean) from public, anon;
grant execute on function private.create_comment(bigint, text, uuid, bigint), public.create_comment(bigint, text, uuid, bigint),
 private.update_comment(bigint, text), public.update_comment(bigint, text),
 private.delete_comment(bigint), public.delete_comment(bigint),
 private.set_community_like(bigint, boolean), public.set_community_like(bigint, boolean),
 private.set_comment_like(bigint, boolean), public.set_comment_like(bigint, boolean) to authenticated;
