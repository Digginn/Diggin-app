SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.clear_withdrawn_comments()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- 본인 글을 먼저 지워 그 글의 댓글도 함께 지운다. FK 연쇄에 맡기면 본인 글의 본인 댓글을
  -- 아래에서 고친 뒤 글이 지워져, 고친 댓글이 없는 글을 가리켜 탈퇴가 실패한다.
  delete from private.posts where author_id = old.id;
  update private.comments set content = null where author_id = old.id;
  return old;
end;
$function$;
