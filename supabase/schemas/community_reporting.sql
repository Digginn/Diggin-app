-- 신고·차단은 커뮤니티 작성 제한 중에도 허용한다. 정지·탈퇴 계정은 제외한다.
create or replace function private.assert_can_report_community()
returns void language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and status <> 'suspended') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.report_community_content(content_type text, target_id bigint, report_reason text, report_detail text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := (select auth.uid());
  parent private.posts%rowtype;
  comment private.comments%rowtype;
  author uuid;
  saved_id bigint;
  clean_detail text := nullif(normalize(btrim(report_detail), NFC), '');
  parent_id bigint;
begin
  perform private.assert_can_report_community();
  if content_type is null or content_type not in ('post','comment') or target_id is null or target_id <= 0 then
    raise exception 'invalid_report_target' using errcode = '22023';
  end if;
  if report_reason is null or report_reason not in ('abuse','spam','inappropriate','other') or
    (report_reason <> 'other' and clean_detail is not null) or private.char_count(clean_detail) > 50 then
    raise exception 'invalid_report_reason' using errcode = '22023';
  end if;
  -- 동일 신고 재시도는 원래 사유·Snapshot을 보존한다. 동시 요청도 한 건만 생성한다.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(viewer::text || ':' || content_type || ':' || target_id::text, 0));
  select r.id into saved_id from private.reports r where r.reporter_id = viewer
    and ((content_type = 'post' and r.post_id = target_id) or (content_type = 'comment' and r.comment_id = target_id));
  if saved_id is not null then return saved_id::text; end if;
  if content_type = 'post' then parent_id := target_id;
  else
    select c.post_id into parent_id from private.comments c where c.id = target_id;
  end if;
  -- 기존 댓글 수정·삭제와 같은 부모 → 댓글 잠금 순서로 Snapshot 경합을 막는다.
  select * into parent from private.posts where id = parent_id for update;
  if not found or parent.deleted_at is not null or parent.hidden_at is not null or
    not private.community_author_visible(parent.author_id) or
    not private.community_content_visible('post', parent.id) then
    raise exception 'report_target_not_found' using errcode = '42501';
  end if;
  if content_type = 'comment' then
    select * into comment from private.comments where id = target_id for update;
    if not found or comment.deleted_at is not null or comment.hidden_at is not null or
      comment.author_id is null or not private.community_author_visible(comment.author_id) or
      not private.community_content_visible('comment', comment.id) then
      raise exception 'report_target_not_found' using errcode = '42501';
    end if;
    author := comment.author_id;
  else author := parent.author_id;
  end if;
  if author = viewer then raise exception 'own_report' using errcode = '42501'; end if;
  insert into private.reports(reporter_id, target_type, post_id, comment_id, reported_user_id, reason, detail, reported_content)
  values (viewer, content_type::public.report_target,
    case when content_type = 'post' then target_id end,
    case when content_type = 'comment' then target_id end, author, report_reason::public.report_reason,
    clean_detail, case when content_type = 'comment' then comment.content end)
  returning id into saved_id;
  return saved_id::text;
end;
$$;

create or replace function private.block_community_author(content_type text, target_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := (select auth.uid());
  author uuid;
begin
  perform private.assert_can_report_community();
  if content_type is null or content_type not in ('post','comment') or target_id is null or target_id <= 0 then
    raise exception 'invalid_report_target' using errcode = '22023';
  end if;
  -- 신고로 이미 숨겨진 대상도 차단 가능하다. 본인의 신고에 저장된 작성자만 사용한다.
  select r.reported_user_id into author from private.reports r where r.reporter_id = viewer
    and ((content_type = 'post' and r.post_id = target_id) or (content_type = 'comment' and r.comment_id = target_id));
  if author is null then raise exception 'report_target_not_found' using errcode = '42501'; end if;
  if author = viewer then raise exception 'own_block' using errcode = '42501'; end if;
  insert into private.user_blocks(blocker_id, blocked_id) values (viewer, author) on conflict do nothing;
end;
$$;

create or replace function public.report_community_content(target_type text, target_id bigint, report_reason text, report_detail text default null)
returns text language sql security invoker set search_path = '' as $$
  select private.report_community_content(target_type, target_id, report_reason, report_detail);
$$;
create or replace function public.block_community_author(target_type text, target_id bigint)
returns void language sql security invoker set search_path = '' as $$
  select private.block_community_author(target_type, target_id);
$$;
revoke execute on function private.assert_can_report_community() from public, anon, authenticated;
revoke execute on function private.report_community_content(text,bigint,text,text), public.report_community_content(text,bigint,text,text),
  private.block_community_author(text,bigint), public.block_community_author(text,bigint) from public, anon;
grant execute on function private.report_community_content(text,bigint,text,text), public.report_community_content(text,bigint,text,text),
  private.block_community_author(text,bigint), public.block_community_author(text,bigint) to authenticated;
