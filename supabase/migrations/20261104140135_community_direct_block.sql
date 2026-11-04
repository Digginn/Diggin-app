-- #186: Generated declarative diff; unrelated existing round-trip changes excluded.
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.block_community_author (
  content_type text,
  target_id    bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  viewer uuid := (select auth.uid());
  author uuid;
begin
  perform private.assert_can_report_community();
  if content_type is null or content_type not in ('post','comment') or target_id is null or target_id <= 0 then
    raise exception 'invalid_report_target' using errcode = '22023';
  end if;
  -- 신고로 숨겨진 대상은 기존 신고의 작성자를 사용해 이전 앱의 차단 흐름을 유지한다.
  select r.reported_user_id into author from private.reports r where r.reporter_id = viewer
    and ((content_type = 'post' and r.post_id = target_id) or (content_type = 'comment' and r.comment_id = target_id));
  -- #186: 새 메뉴에서는 신고 없이도 콘텐츠의 작성자를 차단할 수 있다.
  if author is null then
    if content_type = 'post' then
      select p.author_id into author from private.posts p
      where p.id = target_id and p.deleted_at is null and p.hidden_at is null;
    else
      select c.author_id into author from private.comments c join private.posts p on p.id = c.post_id
      where c.id = target_id and c.deleted_at is null and c.hidden_at is null
        and p.deleted_at is null and p.hidden_at is null
        and private.community_content_visible('post', p.id)
        and (private.community_author_visible(p.author_id) or exists (
          select 1 from private.user_blocks b where b.blocker_id = viewer and b.blocked_id = c.author_id
        ));
    end if;
  end if;
  if author is null then raise exception 'report_target_not_found' using errcode = '42501'; end if;
  if author = viewer then raise exception 'own_block' using errcode = '42501'; end if;
  insert into private.user_blocks(blocker_id, blocked_id) values (viewer, author) on conflict do nothing;
end;
$function$;
