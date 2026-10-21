create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  avatar_path text,
  status public.account_status not null default 'active',
  restricted_until timestamptz,
  suspended_at timestamptz,
  community_policy_agreed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_nickname_format check (nickname ~ '^[가-힣A-Za-z0-9]{2,10}$'),
  constraint profiles_restricted_until_required check (status <> 'community_restricted' or restricted_until is not null),
  constraint profiles_suspended_at_matches_status check ((status = 'suspended') = (suspended_at is not null))
);

-- AUTH-007 영문 대소문자를 무시한 중복 금지
create unique index profiles_nickname_lower_key on public.profiles (lower(nickname));

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;

-- 닉네임·이미지·제재 상태는 RPC와 운영 API로만 바꾼다. 앱은 본인 행만 읽는다.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create table private.nickname_banned_words (
  word text primary key,
  kind text not null,
  constraint nickname_banned_words_lowercase check (word = lower(word)),
  constraint nickname_banned_words_kind check (kind in ('profanity', 'impersonation'))
);

-- korcen 사전의 정상 표현 오탐 보정
create table private.nickname_allowed_words (
  word text primary key,
  constraint nickname_allowed_words_lowercase check (word = lower(word))
);

alter table private.nickname_banned_words enable row level security;
alter table private.nickname_allowed_words enable row level security;
revoke all on table private.nickname_banned_words from anon, authenticated;
revoke all on table private.nickname_allowed_words from anon, authenticated;

-- AUTH-008 사칭 규칙. 영문은 소문자로 정규화한 값을 받는다.
create or replace function private.is_impersonation(nickname_lower text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select nickname_lower in ('diggin', '디긴')
    or nickname_lower ~ '(운영자|관리자|운영진|admin|administrator)'
    or (
      nickname_lower ~ '(diggin|디긴)'
      and nickname_lower ~ '(공식|official|고객센터|customercenter|cs|운영팀|관리팀|team|staff|support|help|service)'
    )
    or exists (
      select 1
      from private.nickname_banned_words as banned
      where banned.kind = 'impersonation'
        and position(banned.word in nickname_lower) > 0
    );
$$;

-- AUTH-008 검사 순서대로 첫 오류 코드를 돌려준다. 통과하면 null.
create or replace function private.nickname_error(nickname text, owner_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
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
$$;

-- AUTH-005 랜덤 닉네임: 형용사 + 디기 + 숫자(예: 느긋한디기12). 직접 변경과 같은 검사를 통과한 후보만 쓴다.
-- 형용사 최대 4자 + 디기 2자 + 숫자 최대 4자라 2~10자 제한을 넘지 않는다.
create or replace function private.generate_nickname()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  adjectives constant text[] := array[
    '느긋한', '귀여운', '다정한', '상냥한', '용감한', '졸린', '배고픈', '신나는', '차분한', '수줍은',
    '행복한', '씩씩한', '포근한', '말랑한', '똑똑한', '엉뚱한', '즐거운', '조용한', '부지런한', '명랑한',
    '당당한', '산뜻한', '보송한', '든든한', '따뜻한', '유쾌한', '깜찍한', '새침한', '늠름한', '대담한',
    '순한', '착한', '겸손한', '기특한', '날쌘', '동그란', '몽글한', '반짝이는', '싱그러운', '느릿한'
  ];
  candidate text;
begin
  for attempt in 1..50 loop
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::integer]
      || '디기'
      || (1 + floor(random() * 9999))::integer::text;
    if private.nickname_error(candidate, null) is null then
      return candidate;
    end if;
  end loop;
  raise exception 'nickname_generation_failed';
end;
$$;

-- 가입 시 프로필과 나의 소장템을 한 번에 만든다(AUTH-005, FLD-001).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  for attempt in 1..5 loop
    begin
      insert into public.profiles (id, nickname) values (new.id, private.generate_nickname());
      exit;
    exception when unique_violation then
      if attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.folders (user_id, kind, name) values (new.id, 'owned', '나의 소장템');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.update_nickname(new_nickname text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  error_code text;
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  error_code := private.nickname_error(new_nickname, current_user_id);
  if error_code is not null then
    return error_code;
  end if;

  update public.profiles set nickname = new_nickname where id = current_user_id;
  return null;
exception when unique_violation then
  return 'duplicate';
end;
$$;

-- 프로필 이미지는 avatars/{user_id}/ 아래 본인 경로만 저장한다. null이면 기본 이미지.
create or replace function private.set_avatar(new_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  perform private.assert_account_access();
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if new_path is not null and new_path !~ ('^' || current_user_id::text || '/[^/]+$') then
    raise exception 'invalid_avatar_path' using errcode = '22023';
  end if;

  update public.profiles set avatar_path = new_path where id = current_user_id;
end;
$$;

create or replace function public.update_nickname(new_nickname text)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.update_nickname(new_nickname);
$$;

create or replace function public.set_avatar(new_path text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_avatar(new_path);
$$;

revoke execute on function private.is_impersonation(text) from public, anon, authenticated;
revoke execute on function private.nickname_error(text, uuid) from public, anon, authenticated;
revoke execute on function private.generate_nickname() from public, anon, authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
revoke execute on function private.update_nickname(text) from public, anon;
revoke execute on function private.set_avatar(text) from public, anon;
grant execute on function private.update_nickname(text) to authenticated;
grant execute on function private.set_avatar(text) to authenticated;

revoke execute on function public.update_nickname(text) from public, anon;
revoke execute on function public.set_avatar(text) from public, anon;
grant execute on function public.update_nickname(text) to authenticated;
grant execute on function public.set_avatar(text) to authenticated;

create table private.withdrawal_surveys (
  id bigint generated always as identity primary key,
  reasons public.withdrawal_reason[] not null default '{}',
  custom_text text,
  created_at timestamptz not null default now(),
  constraint withdrawal_surveys_custom_text_length check (char_length(custom_text) <= 100),
  constraint withdrawal_surveys_has_reason check (cardinality(reasons) > 0 or length(btrim(custom_text)) > 0)
);

-- 개인정보 파기 대상이 아니도록 user_id를 두지 않는다. 탈퇴 Edge Function(service_role)만 쓴다.
alter table private.withdrawal_surveys enable row level security;
revoke all on table private.withdrawal_surveys from anon, authenticated;
