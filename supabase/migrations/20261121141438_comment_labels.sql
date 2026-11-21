SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.community_comment_json (
  target_comment_id bigint
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'id', c.id::text, 'created_at', c.created_at,
    'content', case when c.author_id is null then null else c.content end,
    'is_post_author', c.author_id = p.author_id,
    'is_mine', c.author_id = (select auth.uid()), 'is_withdrawn', c.author_id is null,
    'anon_number', a.number, 'author_nickname', author.nickname,
    'is_operator', operator.id is not null,
    'vote_choice', vote.choice
  ) from private.comments c join private.posts p on p.id = c.post_id
  left join public.profiles author on author.id = c.author_id
  left join private.post_anon_numbers a on a.post_id = c.post_id and a.user_id = c.author_id
  left join private.admin_users operator on operator.id = c.author_id and operator.disabled_at is null
  left join private.vote_responses vote on p.type = 'vote' and vote.post_id = c.post_id and vote.user_id = c.author_id
  where c.id = target_comment_id;
$function$;

CREATE OR REPLACE FUNCTION private.get_community_comments (
  target_post_id   bigint,
  after_created_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id         bigint                   DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
      'anon_number', a.number, 'author_nickname', author.nickname,
      'is_operator', operator.id is not null,
      'vote_choice', vote.choice
    ) order by c.created_at, c.id), '[]'::jsonb)
    from (
      select c.* from private.comments c
      where c.post_id = target_post_id and c.deleted_at is null and c.hidden_at is null
        and private.community_author_visible(c.author_id)
        and private.community_content_visible('comment', c.id)
        and (after_created_at is null or (c.created_at, c.id) > (after_created_at, after_id))
      order by c.created_at, c.id limit 20
    ) c
    join private.posts p on p.id = c.post_id
    left join public.profiles author on author.id = c.author_id
    left join private.post_anon_numbers a on a.post_id = c.post_id and a.user_id = c.author_id
    left join private.admin_users operator on operator.id = c.author_id and operator.disabled_at is null
    left join private.vote_responses vote on p.type = 'vote' and vote.post_id = c.post_id and vote.user_id = c.author_id
  );
end;
$function$;
