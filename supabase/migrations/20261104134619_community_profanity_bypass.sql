SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.contains_community_profanity (
  content text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with base as (
    -- 띄어쓰기·제로폭·기호를 지운다(시.발 → 시발). 저장 본문은 바꾸지 않는다.
    -- NFKC는 호환 자모(ㅅ)를 조합형 자모로 바꾸므로 조합형 자모(U+1100~11FF)도 남기고 사전도 같은 형태로 비교한다.
    select regexp_replace(lower(normalize(coalesce(content, ''), NFKC)), U&'[^a-z0-9\1100-\11FF가-힣]', '', 'g') as value
  ),
  variants as (
    select value, true as keeps_digits from base
    union all
    -- 숫자를 끼워 넣은 우회(시1발)는 숫자까지 지운 값으로 찾는다. 숫자가 든 사전 단어(시8)는 위 값에서만 찾는다.
    select regexp_replace(value, '[0-9]', '', 'g'), false from base
  ),
  banned as (
    select normalize(word, NFKC) as word from private.nickname_banned_words where kind = 'profanity'
  ),
  allowed as (
    select normalize(word, NFKC) as word from private.nickname_allowed_words
  )
  select exists (
    select 1 from variants
    cross join banned
    cross join generate_series(1, char_length(variants.value)) found(pos)
    where (variants.keeps_digits or banned.word !~ '[0-9]')
      and substr(variants.value, found.pos, char_length(banned.word)) = banned.word
      and not exists (
        select 1 from allowed
        cross join generate_series(
          greatest(1, found.pos + char_length(banned.word) - char_length(allowed.word)),
          found.pos
        ) cover(pos)
        where substr(variants.value, cover.pos, char_length(allowed.word)) = allowed.word
      )
  );
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
  -- 게시글·댓글과 같은 검사를 쓴다(숫자를 끼워 넣은 우회 포함).
  if private.contains_community_profanity(nickname_lower) then
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
