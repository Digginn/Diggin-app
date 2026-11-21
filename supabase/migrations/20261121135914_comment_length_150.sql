SET local check_function_bodies = off;

ALTER TABLE "private"."comments"
  DROP CONSTRAINT "comments_content_check";

CREATE OR REPLACE FUNCTION private.normalize_comment_content (
  comment_content text
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER TABLE "private"."comments"
  ADD CONSTRAINT "comments_content_check" CHECK (((content IS NULL) OR ((private.char_count(content) >= 1) AND (private.char_count(content) <= 150))));
