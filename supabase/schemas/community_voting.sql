-- 부모 글을 먼저 잠가 같은 계정의 중복 참여·선택 변경과 글 삭제를 직렬화한다.
create or replace function private.set_community_vote(target_post_id bigint, vote_option text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target private.posts%rowtype;
  viewer_id uuid := (select auth.uid());
begin
  target := private.lock_community_post_for_write(target_post_id);
  if target.type <> 'vote' then raise exception 'invalid_post_type' using errcode = '22023'; end if;
  if vote_option is null or vote_option not in ('buy', 'not') then
    raise exception 'invalid_vote_choice' using errcode = '22023';
  end if;
  if target.author_id = viewer_id then raise exception 'own_vote' using errcode = '42501'; end if;
  -- now()는 트랜잭션 시작 시각이다. 잠금을 기다리다 마감된 요청도 거부해야 한다.
  if clock_timestamp() >= target.ends_at then raise exception 'vote_closed' using errcode = 'P0001'; end if;
  insert into private.vote_responses(post_id, user_id, choice)
  values (target.id, viewer_id, vote_option::public.vote_choice)
  on conflict (post_id, user_id) do update
    set choice = excluded.choice, updated_at = clock_timestamp()
    where private.vote_responses.choice <> excluded.choice;
  return private.community_post_json(target.id, false);
end;
$$;

create or replace function public.set_community_vote(target_post_id bigint, vote_option text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_community_vote(target_post_id, vote_option);
$$;

revoke execute on function private.set_community_vote(bigint, text), public.set_community_vote(bigint, text) from public, anon;
grant execute on function private.set_community_vote(bigint, text), public.set_community_vote(bigint, text) to authenticated;
