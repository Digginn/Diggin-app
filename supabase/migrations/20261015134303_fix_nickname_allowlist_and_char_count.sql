SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.char_count (
  value text
)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select char_length(regexp_replace(value, '[̀-ͯ︎️‍\u20D0-\u20FF\U0001F3FB-\U0001F3FF\U000E0020-\U000E007F]', '', 'g'))
    - (char_length(value) - char_length(replace(value, U&'\200D', '')))
    - (char_length(value) - char_length(regexp_replace(value, '[\U0001F1E6-\U0001F1FF]', '', 'g'))) / 2;
$function$;

CREATE OR REPLACE FUNCTION private.nickname_error (
  nickname text,
  owner_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  nickname_lower text := lower(nickname);
begin
  if nickname is null or private.char_count(nickname) not between 2 and 10 then
    return 'length';
  end if;
  if nickname ~ '\s' then
    return 'whitespace';
  end if;
  if nickname !~ '^[가-힣A-Za-z0-9]+$' then
    return 'invalid_characters';
  end if;
  if exists (
    select 1
    from private.nickname_banned_words as banned
    cross join generate_series(1, char_length(nickname_lower)) as found(pos)
    where banned.kind = 'profanity'
      and substr(nickname_lower, found.pos, char_length(banned.word)) = banned.word
      and not exists (
        select 1
        from private.nickname_allowed_words as allowed
        cross join generate_series(
          greatest(1, found.pos + char_length(banned.word) - char_length(allowed.word)),
          found.pos
        ) as cover(pos)
        where substr(nickname_lower, cover.pos, char_length(allowed.word)) = allowed.word
      )
  ) then
    return 'profanity';
  end if;
  if private.is_impersonation(nickname_lower) then
    return 'impersonation';
  end if;
  if exists (
    select 1
    from public.profiles as profile
    where lower(profile.nickname) = nickname_lower
      and profile.id is distinct from owner_id
  ) then
    return 'duplicate';
  end if;
  return null;
end;
$function$;
