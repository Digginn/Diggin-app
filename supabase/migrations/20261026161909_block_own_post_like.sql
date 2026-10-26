SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.set_community_like (
  target_post_id bigint,
  is_liked       boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;
