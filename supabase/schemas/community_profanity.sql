-- #183: 닉네임의 비속어·정상 단어 사전만 공유한다. 사칭 규칙은 본문에 적용하지 않는다.
-- 닉네임(AUTH-008)·게시글·투표글·댓글이 같은 검사를 쓴다.
create or replace function private.contains_community_profanity(content text)
returns boolean language sql stable set search_path = '' as $$
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
$$;

-- 저장 RPC의 SECURITY DEFINER 문맥에서만 사용한다. 사전과 검사 함수를 앱에 공개하지 않는다.
revoke execute on function private.contains_community_profanity(text) from public, anon, authenticated;
