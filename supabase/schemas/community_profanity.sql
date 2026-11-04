-- #183: 닉네임의 비속어·정상 단어 사전만 공유한다. 사칭 규칙은 본문에 적용하지 않는다.
create or replace function private.contains_community_profanity(content text)
returns boolean language sql stable set search_path = '' as $$
  with normalized as (
    select lower(regexp_replace(normalize(coalesce(content, ''), NFKC),
      U&'[\0009-\000D\0020\00A0\1680\2000-\200D\2028\2029\202F\205F\2060\3000\FEFF]', '', 'g')) as value
  )
  select exists (
    select 1 from normalized
    cross join private.nickname_banned_words banned
    cross join generate_series(1, char_length(value)) found(pos)
    where banned.kind = 'profanity'
      and substr(value, found.pos, char_length(banned.word)) = banned.word
      and not exists (
        select 1 from private.nickname_allowed_words allowed
        cross join generate_series(
          greatest(1, found.pos + char_length(banned.word) - char_length(allowed.word)),
          found.pos
        ) cover(pos)
        where substr(value, cover.pos, char_length(allowed.word)) = allowed.word
      )
  );
$$;

-- 저장 RPC의 SECURITY DEFINER 문맥에서만 사용한다. 사전과 검사 함수를 앱에 공개하지 않는다.
revoke execute on function private.contains_community_profanity(text) from public, anon, authenticated;
