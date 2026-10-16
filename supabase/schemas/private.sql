-- API에 노출하지 않는 스키마. 작성자·운영 데이터와 SECURITY DEFINER 함수를 둔다.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
-- public RPC 래퍼와 check 제약이 private 함수를 호출하므로 로그인 사용자에게 usage만 준다.
grant usage on schema private to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 사용자 인식 문자 수. 앱(unicode-segmenter)과 같게 이모지 조합을 1자로 센다.
-- 피부색·변이 선택자·결합 문자(1️⃣ 같은 키캡 포함)·태그 문자(잉글랜드 같은 지역 국기)는 빼고, ZWJ로 이어진 묶음과 국기(지역 표시 문자 2개)는 1자로 센다.
create or replace function private.char_count(value text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select char_length(regexp_replace(value, '[̀-ͯ︎️‍\u20D0-\u20FF\U0001F3FB-\U0001F3FF\U000E0020-\U000E007F]', '', 'g'))
    - (char_length(value) - char_length(replace(value, U&'\200D', '')))
    - (char_length(value) - char_length(regexp_replace(value, '[\U0001F1E6-\U0001F1FF]', '', 'g'))) / 2;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;
revoke execute on function private.char_count(text) from public, anon;
grant execute on function private.char_count(text) to authenticated;
