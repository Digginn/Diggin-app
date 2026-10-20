# DIGGIN DB 스키마 설계 기준

이 문서는 DIGGIN DB의 최종 설계와 구현 방식을 정리한다. DB 작업 절차는 `docs/DB_RULES.md`를 따르고, 무엇을 어떤 모양으로 만들지는 이 문서를 따른다.

- 설계 원본: FigJam '스키마 최종 · 2026.10.14' 영역 (25개 테이블, 관계선, enum, 핵심 규칙)
- 기준 명세: 기능명세서 2026.10.14 변경이력까지
- 구현 위치: `supabase/schemas/` (선언형 스키마, 실제 기준은 이 SQL 파일)
- 이 문서와 SQL이 다르면 SQL이 맞다. 설계를 바꾸면 SQL과 이 문서를 같은 PR에서 같이 고친다.

## 1. 진행 상황

| 영역           | 테이블                                                                                                                         | 상태                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 계정·MY        | profiles, nickname_banned_words, nickname_allowed_words, withdrawal_surveys, legal_policies, user_policy_consents, push_tokens | 구현 (#71)                                                           |
| 폴더           | folders                                                                                                                        | 구현 (#71). 가입 시 나의 소장템을 만들어야 해서 먼저 넣었다          |
| 아이템·CSV     | products, product_folders, import_jobs, import_failures                                                                        | products, product_folders 구현 (#78). import_*와 CSV 저장 구현 (#69) |
| 커뮤니티       | posts, post_products, vote_responses, post_likes, comments, post_anon_numbers                                                  | DB·조회 (#94), 작성·삭제 (#95), 투표 (#96), 댓글·좋아요 (#97)        |
| 신고·알림·운영 | reports, user_blocks, notifications, like_notification_log, admin_users, admin_actions                                         | 알림 생성·목록 (#104). Push 발송·신고·운영은 미구현                  |

## 2. 스키마를 public과 private으로 나눈 이유

```
public   앱이 테이블을 직접 읽는 곳. 본인 데이터만 RLS로 보인다.
private  API에 노출하지 않는 곳. 앱은 RPC로만 접근한다.
```

커뮤니티는 익명이다. RLS는 행만 가리고 컬럼은 못 가린다. 앱이 posts를 읽을 수 있으면 author_id도 같이 보여서 누가 썼는지 추적된다. 그래서 작성자가 들어 있는 커뮤니티·신고·차단·운영 테이블은 private에 두고, 앱에는 작성자 대신 `is_mine` 같은 값만 돌려주는 RPC를 연다.

`config.toml`의 `[api].schemas`는 public, graphql_public만 노출한다. private은 노출 목록에 넣지 않는다.

## 3. 구현 패턴 (새 테이블·RPC를 만들 때 그대로 따른다)

이미 구현한 파일이 예시다. `supabase/schemas/profiles.sql`, `folders.sql`, `legal_policies.sql`, `push_tokens.sql`을 먼저 읽는다.

### 3-1. 테이블과 권한

- PK는 `bigint generated always as identity`. 사용자 id는 `auth.users`의 uuid를 그대로 쓴다.
- 모든 테이블에 RLS를 켠다. private 테이블도 켠다(이중 방어).
- 기본 권한을 믿지 않는다. 테이블마다 `revoke all on table ... from anon, authenticated;` 후 필요한 것만 grant한다. 컬럼 단위로 줄 수 있으면 컬럼 단위로 준다(예: folders는 `insert (name), update (name)`).
- private 테이블은 grant를 주지 않는다.
- 정책은 `to authenticated`와 소유자 조건을 함께 쓴다. `auth.uid()`는 `(select auth.uid())`로 감싼다.
- update 정책은 `using`과 `with check`를 둘 다 쓴다.
- 정책·FK에 쓰는 user_id 컬럼에는 인덱스를 둔다. 복합 unique가 앞 컬럼으로 user_id를 가지면 그걸로 충분하다.
- `updated_at`은 `private.set_updated_at()` 트리거로 갱신한다.

### 3-2. RPC

- 앱이 부르는 함수는 public에 얇은 래퍼를 두고(`security invoker`, `language sql`), 실제 로직은 private의 `security definer` 함수에 둔다.
- definer 함수는 전부 `set search_path = ''`, 함수 안에서 테이블 스키마를 명시하고, 첫 줄에서 `(select auth.uid())`가 null이면 `raise exception 'not_authenticated' using errcode = '42501'`.
- 함수를 만들면 `revoke execute ... from public, anon` 후 필요한 역할에만 grant한다. 트리거 함수와 내부 함수는 authenticated에게도 주지 않는다.
- private 스키마는 authenticated에게 usage만 준다(래퍼와 check 제약이 private 함수를 부르기 때문).
- 오류 처리
  - 입력값 검증 결과처럼 화면에 문구를 띄울 실패는 오류 코드 문자열을 돌려준다. 예: `update_nickname`은 `length | whitespace | invalid_characters | profanity | impersonation | duplicate` 중 하나 또는 성공 시 null.
  - 잘못된 호출은 예외로 던진다. 인증 없음 `42501`, 잘못된 값 `22023`, 업무 규칙 위반 `P0001`(예: `folder_limit_reached`).

### 3-3. 글자 수와 문자열

- 화면 기준 글자 수는 `private.char_count(text)`로 센다. 앱(unicode-segmenter)과 같게 👍🏻, 가족 이모지, 국기, 1️⃣ 같은 키캡을 1자로 센다. 폴더명·게시글·투표 질문·댓글에 쓴다.
- 상품명·브랜드명은 명세가 "NFC 정규화 후 문자 수"라서 `char_length`로 센다.
- 사용자 입력 문자열은 before insert/update 트리거에서 `normalize(btrim(...), NFC)`로 정리한 뒤 제약으로 검사한다(예: `private.normalize_folder_name()`).

### 3-4. 마이그레이션과 데이터

- 스키마 파일을 고치고 `npx supabase db schema declarative sync -f <이름> --no-apply`로 마이그레이션을 만든다. 마이그레이션을 손으로 쓰지 않는다.
- 데이터(버킷, 초기 행, 사전 데이터)는 선언형으로 표현되지 않는다. `npx supabase migration new <이름>`으로 파일을 만들어 직접 쓴다(예: `create_avatars_bucket`).
- pg_cron 작업은 스키마 파일에 `select cron.schedule('<고유 이름>', ...)`로 선언한다.

### 3-5. 테스트와 타입

- pgTAP 테스트는 `supabase/tests/*.test.sql`. 정상 접근과 함께 권한 없는 접근 차단을 반드시 넣는다.
- 테스트 사용자는 `insert into auth.users (id, email)`로 만들고, `set local role authenticated; set local request.jwt.claims = '{"sub": "<uuid>", "role": "authenticated"}';`로 그 사용자가 된다. 예시는 `supabase/tests/auth_my.test.sql`.
- 타입은 `npx supabase gen types --lang typescript --local > src/types/database.types.ts` 후 prettier로 정리해 커밋한다.

## 4. Enum

```
wish_level          high | medium | low                               (구현)
folder_kind         custom | owned                                    (구현)
post_type           post | vote
vote_choice         buy | not
report_target       post | comment
report_reason       abuse | spam | inappropriate | other
report_status       received | reviewing | resolved | rejected
account_status      active | warning | community_restricted | suspended   (구현)
notification_type   vote_ended | post_commented | post_liked
import_status       processing | completed | failed                     (구현)
import_fail_reason  EMPTY_PRODUCT_NAME | EMPTY_PRODUCT_URL | INVALID_PRODUCT_URL | CSV_ROW_PARSE_ERROR | INVALID_PRODUCT_DATA | FOLDER_LIMIT_EXCEEDED | FOLDER_SAVE_FAILED (구현)
withdrawal_reason   rarely_used | missing_feature | other_service | hard_to_use | frequent_error   (구현)
admin_role          operator | super_admin
```

report_reason은 `src/components/modal/ReportModal.tsx`의 사유 4개 순서와 같다. withdrawal_reason은 MY-006 선택지 5개 순서와 같다.

## 5. 구현된 영역 요약 (#71)

자세한 정의는 `supabase/schemas/`를 본다.

- 가입 트리거 `private.handle_new_user()`: auth.users insert 시 profiles(랜덤 닉네임)와 나의 소장템 폴더를 만든다.
- 랜덤 닉네임 `private.generate_nickname()`: 형용사 + 디기 + 숫자(예: 느긋한디기12). 형용사 40개(2~4자), 숫자 1~9999라 2~10자 안에 들어간다. 직접 변경과 같은 검사를 통과한 후보만 쓴다(AUTH-005).
- 닉네임 검사 `private.nickname_error()`: 글자 수 → 공백 → 특수문자·이모지 → 금칙어 → 사칭 → 중복(AUTH-008). 사칭 규칙은 명세 문구대로 함수에 있고, 금칙어는 `private.nickname_banned_words`(korcen 사전, 아직 비어 있음), 오탐 보정은 `nickname_allowed_words`.
- profiles: 앱은 본인 행 select만. 닉네임은 `update_nickname`, 이미지는 `set_avatar`, 제재 상태는 운영 API만 바꾼다.
- folders: 사용자별 이름 중복 금지, 일반 폴더 최대 50개(프로필 행을 잠근 뒤 센다), 나의 소장템은 만들기·고치기·지우기 불가. `last_added_at`은 상품을 담을 때 트리거로 갱신한다(#78).
- legal_policies(public, 비회원도 조회) / user_policy_consents(private): `get_pending_policies()`, `accept_policy(policy_id)`.
- push_tokens: 등록은 `register_push_token(token, platform)`만(같은 토큰은 마지막 로그인 계정으로 옮김), 앱은 본인 토큰 select·delete.
- withdrawal_surveys(private, user_id 없음): 탈퇴 Edge Function이 service_role로만 쓴다.
- Storage avatars 버킷: 비공개, WebP, 512KB 이하, 경로 `{user_id}/파일명`, 본인 폴더만 select·insert·update·delete.
- 카카오 프로필 이미지(AUTH-006)는 URL로 두지 않고 신규 가입 때 앱이 받아 avatars에 512 WebP로 복사한다(`set_avatar`). 카카오에서 사진을 바꾸거나 지워도 앱 사진이 깨지지 않는다.

## 5-1. 구현된 영역 요약 (#78 아이템)

- products: 앱은 본인 상품 select·delete, update는 name·brand·price·wish_level만. 링크·대표 이미지는 고칠 수 없다(PDT-006). 만들기는 `save_product`로만.
- 입력 검사 `private.product_input_error(url, name, brand, price)`: `invalid_url | name_required | name_too_long | brand_too_long | invalid_price` 중 하나 또는 null. 저장과 CSV 가져오기가 같은 함수로 검사한다. 상한을 넘는 자동 추출·CSV 값은 호출하는 쪽이 잘라서 넘긴다.
- 정규화 트리거: 링크는 앞뒤 공백 제거, 상품명·브랜드는 NFC + 앞뒤 공백 제거, 빈 브랜드는 null.
- `save_product(url, name, brand?, price?, image_url?, wish_level?, folder_ids?)` → `(product_id, is_duplicate)`. 같은 링크면 저장하지 않고 기존 상품 id와 `is_duplicate = true`를 돌려준다(SAVE-012). 입력 오류는 `22023` 예외(메시지가 위 오류 코드). 나의 소장템을 같이 고르면 위시레벨을 비운다.
- `set_owned(product_id, is_owned, keep_other_folders = true, new_wish_level?)`: 소장 추가 시 위시레벨을 비우고 나의 소장템에 담는다. `keep_other_folders = false`면 다른 폴더에서 뺀다(MSG-PDT-009). 해제할 때 `new_wish_level`을 안 넘기면 위시레벨 미선택(null)으로 둔다(10/17 결정, PDT-008 필수 여부는 PM 확인 중).
- `set_product_folders(product_id, folder_ids)`: 폴더 관리 시트의 최종 선택을 한 트랜잭션으로 반영한다. 상품 행을 잠그고, 내 폴더가 아니면 `folder_not_found`로 아무것도 바꾸지 않는다. 나의 소장템이 바뀌면 `set_owned` 규칙을 따른다.
- product_folders: 앱은 일반 폴더만 직접 담기(insert)·빼기(delete). 나의 소장템은 `set_owned`로만. 담으면 `folders.last_added_at`을 담은 시각으로 바꾸고, 빼도 되돌리지 않는다.
- 소장템 상품에 위시레벨을 넣거나, 위시레벨 있는 상품을 소장템에 담으면 `owned_product_wish_level`(P0001)로 막는다.

## 5-2. 구현된 영역 요약 (#69 CSV 저장)

- `import_csv(request_id uuid, import_plan jsonb)`는 본인 상품·폴더·관계를 저장하고 실제 성공 수·제외 상품·폴더 연결 경고를 반환한다. CSV 파싱은 앱에서 하고 상품 입력·URL 중복·계정·폴더 한도는 서버에서 다시 검사한다.
- CSV로 생성한 폴더는 `folders.csv_source_name`에 원본 버킷명을 보존하고 다음 Import에서 우선 재사용한다. 표시 이름을 바꿔도 원본 매핑은 유지하고 삭제하면 함께 사라진다. 보존된 원본이 없으면 기존 일반 폴더명과 정확히 일치할 때 재사용한다. 다른 원본의 잘린 이름 충돌은 앱이 7자 내 번호로 구분하고, 조회 이후의 충돌은 서버가 `40001`로 취소해 최신 목록으로 다시 계산하게 한다. 프로필·기존 상품·폴더를 잠가 동시 생성과 소장 처리를 보호한다.
- 상품은 저장하면서 `saved_at`에 CSV 등록일을 넣는다. 서버는 미래 날짜·유한하지 않은 날짜를 `INVALID_PRODUCT_DATA`로 제외한다. 중복 URL은 기존 정보를 유지하고 폴더·소장 관계만 추가한다. 선택 가격이 DB 정수 범위를 넘으면 가격만 null로 저장한다. 원화 판별 규칙은 미완료라 실사용 경로의 가격은 모두 null이다.
- 새 일반 폴더가 50개 한도를 넘으면 관계 실패로 기록하고 상품은 ALL에 남긴다. 이미 있는 폴더에는 한도와 관계없이 연결한다. 소장 Y는 `private.set_owned`를 재사용한다.
- 한 요청의 저장과 완료 결과는 같은 트랜잭션이다. 같은 계정·`request_id` 재시도는 최초 완료 결과를 반환하므로 응답 유실로 폴더를 다시 만들지 않는다. 앱은 `import_jobs`, `import_failures`에서 본인 기록 select만 가능하다.
- 파싱 실패·상품 검증 실패와 폴더 관계 경고를 `import_failures`로 구분해 기록한다. 폴더 경고는 작업의 상품 실패 수에 더하지 않는다. 큰 CSV 처리를 위해 public RPC에만 `statement_timeout = '60s'`를 둔다.

## 6. 도메인별 테이블 설계

컬럼 옆 설명은 제약과 근거 명세다. FigJam 최종본과 같다.

### 6-1. 아이템·CSV (public)

```
products
  id          bigint identity PK
  user_id     uuid not null, FK profiles on delete cascade
  url         text not null, check ~* '^https://'      SAVE-017, 10/14 HTTPS만
  name        text not null, NFC·trim 후 1~100자       SAVE-005·010
  brand       text null, NFC·trim 후 0~30자, 빈 값은 null
  price       integer null, >= 0                      null = 정보 없음, 0 = 직접 입력한 0원
  image_url   text null                               null = Placeholder, 저장 후 변경 불가
  wish_level  wish_level null                         나의 소장템 상품은 null
  saved_at    timestamptz not null default now()      CSV는 등록일
  created_at, updated_at
  unique (user_id, url), unique (id, user_id), index (user_id, saved_at desc, id desc)

folders (CSV 추가 컬럼)
  csv_source_name text null, unique (user_id, csv_source_name)
  null = 직접 생성 또는 원본을 보존하지 않은 기존 폴더
  값이 있으면 custom만 허용, NFC·trim된 비어 있지 않은 원본 버킷명
  앱은 본인 폴더에서 select만 가능하며 이 컬럼의 insert/update는 RPC만 수행

product_folders
  product_id, folder_id  PK
  user_id     uuid not null
  created_at  timestamptz not null default now()
  FK (product_id, user_id) → products(id, user_id) on delete cascade
  FK (folder_id, user_id)  → folders(id, user_id) on delete cascade
  index (folder_id, created_at desc)

import_jobs
  id bigint identity PK, user_id FK profiles on delete cascade,
  request_id uuid not null, unique (user_id, request_id), unique (id, user_id),
  status import_status default 'processing', result jsonb null,
  total_count, success_count, failed_count, duplicate_count (integer default 0),
  started_at timestamptz default now(), finished_at timestamptz null
  완료 시 total_count = success_count + failed_count + duplicate_count

import_failures
  id bigint identity PK, job_id, user_id FK profiles on delete cascade, row_number integer >= 2,
  FK (job_id, user_id) → import_jobs(id, user_id) on delete cascade,
  product_name text null, source_folder_name text null, reason import_fail_reason,
  index (job_id), index (user_id)
```

- products 앱 grant: select, delete, update(name, brand, price, wish_level). insert는 RPC `save_product`로만(상품과 폴더 관계를 한 트랜잭션에, 중복 URL이면 기존 id 반환).
- 상품명·브랜드 초과: 직접 입력·수정은 거부, 자동 추출·CSV는 상한까지 자른다(이모지 중간에서 자르지 않음).
- 나의 소장템에 든 상품에 wish_level을 넣으면 트리거로 막는다. 소장 추가·해제는 RPC `set_owned`로만(PDT-008).
- product_folders insert 시 folders.last_added_at을 now()로 갱신하고, 빼거나 지워도 되돌리지 않는다(FLD-001 "상품 삭제는 순서를 바꾸지 않는다"). 많이 담은 순은 관계 개수로 센다.
- 복합 FK라 남의 폴더에 내 상품을 넣는 행은 DB가 거부한다.
- 보존된 CSV 원본 버킷명이 있으면 현재 표시 이름으로 재사용하고, 없으면 원본 버킷명이 기존 일반 폴더명과 정확히 같을 때 재사용한다. 반복되는 같은 원본 버킷명은 하나의 폴더에 담는다. 신규 이름은 공백 포함 7자로 자르고, 잘린 결과만 기존 폴더나 다른 버킷에 배정된 이름과 겹치면 2부터 번호를 붙이되 번호도 7자 안에 포함한다. CSV로 새로 만든 폴더의 원본명은 `csv_source_name`에 저장한다. 과거에 원본을 보존하지 않은 긴 버킷명은 추측해 연결하지 않는다. 직접 만든 일반 폴더와 CSV가 만든 일반 폴더를 합해 계정당 50개이며 나의 소장템은 제외한다. 기존 폴더 재사용은 한도와 무관하게 허용하고, 새로 만들 수 없는 버킷의 상품은 ALL에만 저장한다.

### 6-2. 커뮤니티 (전부 private, 앱 grant 없음)

#### #94 구현된 읽기 기반

`supabase/schemas/community.sql`에 posts, post_products, vote_responses, post_likes, comments, post_anon_numbers와 조회 제외에 필요한 user_blocks, reports를 구현했다. 전부 RLS를 활성화하고 앱 역할의 테이블·시퀀스 직접 접근을 회수한다. 작성·정책 동의·삭제는 아래 #95 구현을 따른다. 투표는 아래 #96, 댓글·좋아요는 #97 구현을 따른다. 운영·알림은 후속 작업이다. hidden_at/deleted_at은 구현했고 운영자 hidden_by FK는 운영 스키마 작업에서 추가한다.

- `get_community_feed(feed_type = 'all', after_created_at?, after_id?)`: 일반글·투표글 통합 또는 투표글만 최신순 20개를 반환한다. `(created_at, id)` 커서로 같은 시각의 글·앞쪽 신규 삽입에도 중복 페이지를 방지한다. 비회원은 첫 줄 본문과 Snapshot 이미지만 받으며 상품명·브랜드·가격·원본 링크·집계·본인 여부는 받지 않는다. 페이지 경계용 id/type/created_at은 포함한다.
- `get_community_post(target_post_id)`: 회원만 상세 Snapshot과 개수를 조회한다. 삭제·숨김·없는 글·내가 차단하거나 신고한 작성자의 글은 null이다. 작성자 UUID는 응답에 없고 `is_mine`만 반환한다.
- `get_community_comments(target_post_id, after_created_at?, after_id?)`: 동일한 게시글 접근 조건을 확인한 뒤 오래된 순 20개를 반환한다. 댓글도 삭제·숨김·작성자 차단/신고를 제외한다. UUID 없이 글쓴이/본인/탈퇴 여부와 게시물 단위 익명번호를 반환하며 탈퇴 사용자 본문은 항상 null이다.
- 투표 집계는 참여자·작성자에게 공개하고, 마감 후에는 미참여 회원에게도 공개한다(2026-10-20 사용자 확정). 진행 중 미참여 회원의 집계는 null이다. 비회원에게는 항상 집계를 반환하지 않는다. `server_now`와 `ends_at`을 내려 기기 시각으로 마감을 판정하지 않는다.
- 정지 계정과 유효하지 않은 JWT 사용자 접근을 차단한다. 커뮤니티 제한 계정은 조회 가능하다. 내부 `assert_can_write_community()`는 인증·제재 만료를 검사하며 후속 쓰기 RPC가 재사용한다. 앱에는 직접 실행 권한을 주지 않는다.
- definer 구현은 private, invoker 래퍼는 public이다. 비회원 피드 래퍼에 필요한 private 스키마 usage와 피드 함수 execute만 anon에 허용하고 원본·내부 helper·상세·댓글 권한은 주지 않는다.
- #94 화면은 실제 조회만 제공하며 기존 목업의 등록·삭제·투표·댓글·좋아요·신고/차단·상품 저장 성공 동작을 원격 글에 적용하지 않는다. 작성·삭제 Action은 #95에서 연결했으며 댓글·좋아요는 #97에서 연결했고 투표 참여는 #96에서 연결했고 나머지는 #98·99 및 별도 신고·차단 작업에서 연결한다.

마이그레이션은 로컬 Docker가 없는 환경에서 PR의 임시 CI가 CLI 2.120.0 `db schema declarative sync -f community_read --no-apply`로 생성한 artifact를 검토해 추가했다. 같은 임시 DB에서 전체 마이그레이션·pgTAP·lint·Advisors와 타입 생성을 수행했으며 생성용 워크플로는 최종 변경에서 제거한다. 이후 검증은 공통 DB 배포 워크플로를 따른다.

#### #95 구현된 작성·정책 동의·삭제

- `profiles.community_policy_agreed_at timestamptz null`: 계정별 최초 커뮤니티 동의 시각. 본인만 조회하고 앱의 직접 UPDATE는 허용하지 않는다. 기존 약관·개인정보 처리방침 동의와 별도로 관리한다.
- `agree_community_policy()`: 인증·커뮤니티 쓰기 제한 검사 후 서버 시각을 저장한다. 이미 동의했다면 최초 시각을 보존한다. 일반 게시글 편집기는 동의 여부 조회·저장에 성공한 뒤에만 표시한다. 최초 필수 동의는 DGL-006의 일반글 진입에 적용하며 투표 진입에 추가 강제하지 않는다.
- `create_post(post_kind, post_content, product_ids, request_id) → text`: 인증·제재, NFC 정규화 후 공백 제외 5~50자, 중복 없는 본인 상품(일반글 1~4개·투표글 1개), 일반글 정책 동의를 검증한다. 앱과 DB가 NBSP·전각 공백을 포함한 같은 공백 집합을 제외한다. 상품 행을 id 순으로 잠근 뒤 선택 순서대로 이미지·이름·브랜드·가격·URL을 Snapshot에 복사한다. 글과 Snapshot은 한 트랜잭션이며 원본 상품 수정·삭제 후에도 유지한다. 투표 종료 시각은 서버 생성 시각 +24시간이다.
- `posts.creation_request_id uuid`와 `(author_id, creation_request_id)` unique로 응답 유실 후 같은 등록 요청을 재시도해도 기존 글 id를 반환한다. 앱은 같은 본문·첨부로 재시도할 때 키를 유지하고 내용을 바꾸면 새 키를 사용한다. 글 id는 bigint 정밀도를 잃지 않도록 문자열로 반환한다.
- `delete_community_post(target_post_id)`: 인증된 본인 글만 잠근 뒤 글·댓글을 soft delete하고 투표 응답은 실제 삭제한다. 재시도는 안전하며 원본 ALL 상품은 변경하지 않는다. 커뮤니티 작성 제한 중에도 본인 콘텐츠 정리는 허용한다. 후속 댓글·투표 쓰기 RPC도 부모 글 행을 먼저 잠그고 삭제 여부를 검사해야 삭제와의 경합을 막을 수 있다.
- 작성 후 수정·이미지 교체 API는 제공하지 않는다. 등록·삭제 성공 시 `community` 캐시 전체를 무효화한다. 후속 내 활동 조회도 이 키 아래에 둔다.
- 작성 이탈 확정 시 초안을 폐기한다. 상품 상세로 돌아갈 대상이 없는 DIGGLE 직접 진입은 DIGGLE로 복귀한다(사용자 확인, 2026-10-19). 이어 쓰기는 본문·첨부를 유지한다.
- 기준: [최신 기능명세](https://docs.google.com/spreadsheets/d/1Q7K3St6Kl0jSTVTvoBYdSzdioU4xfd0dXI_NpNYZ2fQ/edit?gid=1996326967)의 DGL-004~010·013, VOTE-001~003·012, SYS-006. 정책 Banner 문구와 읽기 전용 보기도 동일 기준으로 연결한다.
- 마이그레이션은 CLI 2.120.0 선언형 sync로 생성했다. 임시 로컬 DB에서 전체 이력 reset·pgTAP·lint·Advisors를 검증하며 공유 DB는 변경하지 않는다.

#### #96 BUY·NOT 참여·변경·결과·마감

- `set_community_vote(target_post_id, vote_option)`는 `buy`/`not`만 받고 서버의 게시글 JSON을 반환한다. 사용자는 JWT에서 결정하며 원시 응답·작성자 UUID는 공개하지 않는다. 최초 참여는 insert, 다른 선택은 기존 행 update, 같은 선택은 시각·행을 변경하지 않는다. 계정당 한 표를 unique로 보장한다.
- #97의 부모 글 잠금과 공통 가드로 삭제·숨김·차단/신고·제재를 검사한다. 작성자 본인 참여는 `own_vote`, 마감은 `vote_closed`로 거부한다. 잠금을 얻은 뒤 `clock_timestamp()`로 마감을 다시 판정하므로 트랜잭션 시작 시각이 마감 전이어도 늦은 저장은 차단한다.
- 결과 공개: 진행 중 참여자와 작성자, 마감 후 미참여 회원에게 공개한다(2026-10-20 사용자 확정). 피드·상세가 같은 직렬화 함수를 사용한다. 진행 중 미참여자와 비회원에게 집계 우회 조회를 허용하지 않는다.
- 앱은 저장 성공 응답으로 선택·집계를 같은 화면에 반영한다. 실패하면 기존 선택·결과를 유지하고 SYS 오류를 안내한다. 같은 선택·연타·비회원·마감 요청을 막으며 작성자는 결과 바를 누르면 참여 불가 Toast를 받는다.
- 마감 시점·앱 복귀·성공한 투표 후 community 캐시를 갱신한다. 최종 결과 조회 실패 시 기존 결과를 유지한다. 계정 변경·화면 이탈 뒤 늦은 응답은 새 캐시에 적용하지 않는다.
- 마감 알림 연동 계약: 서버 `ends_at`이 도달한 삭제·숨김 아닌 투표에 대해 `vote_ended:{post_id}` 키로 작성자에게 한 번만 알린다. 수신자는 서버에서 결정한다. 실제 이벤트 저장·스케줄·Push 발송은 알림 작업에서 구현하며 앱 타이머가 알림을 만들지 않는다. 알림 담당자 확인이 필요하다.
- 검증: pgTAP의 권한·공개 범위·마감·중복·변경 검사와 `scripts/check_vote_concurrency.py --container supabase_db_diggin-96`의 실제 동시 참여·잠금 대기 마감 검사를 사용한다.

#### #97 댓글·익명번호·좋아요

- `create_comment(target_post_id, comment_content, request_id)` / `update_comment(target_comment_id, comment_content)`는 작성자 UUID 없이 조회와 같은 댓글 JSON을 반환한다. `delete_comment(target_comment_id)`는 본인 댓글을 soft delete한다. 수정은 같은 본문도 허용하며 `updated_at`만 갱신하고 정렬용 `created_at`은 보존한다.
- 댓글 본문은 NFC·CRLF/CR → LF 정규화 후 사용자 인식 문자 1~30자다. 공백·줄바꿈도 세며 공백만 있는 본문은 거부한다. 앱은 초과 입력을 유지하되 전송을 막고, 조회한 줄바꿈은 개수만큼 공백으로 표시한다. HTTP(S)로 해석 가능한 URL만 외부 링크로 만든다.
- 모든 댓글·좋아요 쓰기는 `private.lock_community_post_for_write()`로 인증·제재를 확인하고 부모 글 행을 잠근 뒤 변경한다. 글 삭제도 같은 행을 먼저 잠그므로 삭제 후 댓글이나 좋아요가 추가되는 경합을 막는다. 삭제·숨김·차단/신고로 접근할 수 없는 글은 쓰기도 허용하지 않는다. 댓글 수정·삭제는 글쓴이에게도 타인 댓글 권한을 주지 않는다.
- `post_anon_numbers`는 최초 댓글 때만 할당하고 같은 글에서 유지한다. 부모 글 잠금 안에서 `next_anon_number`를 올리므로 동시 참여에도 중복 번호가 없다. 글쓴이는 번호를 소비하지 않는다. 본인·글쓴이·탈퇴 라벨과 본문 비공개는 조회 계약을 따른다.
- `comments.creation_request_id`와 `(author_id, creation_request_id)` unique로 응답 유실·동시 재시도에 같은 댓글을 반환한다. 다른 게시글로 키를 재사용하면 거부한다. 앱은 성공한 댓글을 서버 페이지와 중복 없이 합치며 서버 커서를 바꾸지 않는다. 등록 후 새 댓글까지 남은 페이지를 읽고 이동하고, 실패한 조회는 댓글 영역에서 재시도한다.
- `set_community_like(target_post_id, is_liked)`는 일반글에만 적용하고 `{is_liked, like_count}`를 반환한다. 계정당 한 행이며 원하는 상태를 지정하므로 재시도해도 토글되지 않는다. 댓글 작성과 독립적으로 실행하며 앱의 낙관적 아이콘·개수는 실패 시 원상 복구한다.
- 등록·수정·삭제·좋아요 성공은 `community` 캐시를 갱신한다. 후속 내 활동도 같은 키 아래에 두어 함께 갱신한다. 계정이 바뀌거나 화면을 떠난 후 도착한 응답으로 새 계정의 초안·캐시를 변경하지 않는다.
- 알림 연동 계약: 댓글 등록 성공 트랜잭션에서 `comment:{comment_id}`를 이벤트 키로 사용하고 본인 댓글은 알리지 않는다. 수정·삭제·재시도는 새 등록 이벤트가 아니다. 좋아요 알림은 `(post_id, actor_id)`를 `like_notification_log`에 최초 한 번 기록하는 계약이며 취소·재등록으로 다시 발송하지 않는다. 수신자는 서버가 글에서 결정하고 UUID를 앱에 반환하지 않는다. 알림 테이블·실제 이벤트 저장·Push 발송은 알림 작업에서 이 RPC에 연결한다.
- 로컬 검증: 전체 pgTAP, DB lint·Advisors와 `scripts/check_community_concurrency.py --container supabase_db_diggin-97`로 실제 동시 요청을 확인한다. 테스트 데이터만 사용하는 임시 DB에서 실행한다.

#### 후속 쓰기를 포함한 설계 계약

```
posts
  id, author_id uuid not null FK profiles on delete cascade   탈퇴 시 글 삭제(MY-007)
  type post_type, content text
  ends_at timestamptz null                  투표만, created_at + 24h
  deleted_at, hidden_at timestamptz null, hidden_by FK admin_users null
  created_at, next_anon_number integer not null default 1
  creation_request_id uuid not null, unique (author_id, creation_request_id)
  content: 일반글·투표글 모두 공백 제외 5~50자, char_count 기준(DGL-005·VOTE-002 최신 정책)

post_products   (post_id, position 1~4) PK, name, brand, price integer, url, image_url
vote_responses  id, post_id, user_id null(탈퇴 후), choice, created_at, updated_at, unique (post_id, user_id)
post_likes      id, post_id, user_id null(탈퇴 후), created_at, unique (post_id, user_id)
comments        id, post_id, author_id null(탈퇴 후), content 1~30자(줄바꿈 1자) 탈퇴 후 null,
                deleted_at, hidden_at, hidden_by, created_at, updated_at,
                creation_request_id uuid not null, unique (author_id, creation_request_id)
post_anon_numbers  (post_id, user_id) PK, number, unique (post_id, number)
```

- post_products는 `create_post`가 본인 상품에서 값을 복사한다. 원본 product_id는 저장하지 않는다. 일반글 1~4개, 투표글 정확히 1개.
- 수정 RPC는 없다(DGL-008). 삭제는 deleted_at, 댓글도 같이 soft delete. 투표글 삭제 시 vote_responses는 실제로 지운다.
- `set_community_vote`는 upsert. 공통 쓰기 권한·부모 글 잠금 후 투표글·유효 선택·본인 글 제외·서버 `clock_timestamp() < ends_at`을 검사한다. 잠금 대기 중 마감된 요청도 차단한다.
- 투표 결과는 진행 중 참여자·작성자, 마감 후 미참여 회원에게도 공개한다. 진행 중 미참여자는 buy_count·not_count가 null이고 비회원 미리보기에는 필드 자체가 없다. 퍼센트는 앱이 계산한다.
- 좋아요는 일반글만(LIKE-001).
- 익명 번호는 그 사용자의 첫 댓글일 때 posts.next_anon_number를 올리며 받는다. 글쓴이는 번호를 받지 않는다. 댓글 조회는 author_id 대신 `is_post_author, anon_number, is_mine, is_withdrawn`을 돌려준다.
- 모든 커뮤니티 조회는 삭제·숨김, 내가 차단한 작성자, 내가 신고한 작성자의 콘텐츠를 뺀다.

### 6-3. 신고·차단 (private)

```
reports
  id, reporter_id null, target_type, post_id null, comment_id null, reported_user_id null,
  reason, detail ≤50자 null(reason = 'other'일 때만), reported_content null(댓글 신고 스냅샷),
  status default 'received', created_at, updated_at
  unique (reporter_id, post_id) where target_type = 'post'
  unique (reporter_id, comment_id) where target_type = 'comment'

user_blocks  (blocker_id, blocked_id) PK, created_at, check blocker_id <> blocked_id
```

- 신고만으로 차단하지 않는다. 신고 후 모달에서 '차단하기'를 눌렀을 때만 user_blocks를 만든다(RPT-003).
- 차단 RPC는 user id를 받지 않고 post_id나 comment_id를 받아 서버에서 작성자를 찾는다. 차단 목록은 앱에 열지 않는다.
- RPT-004 차단은 단방향이다. 차단한 사용자에게만 차단 대상의 게시글·투표글·댓글·답글을 숨긴다. 차단당한 사용자에게는 차단한 사용자의 콘텐츠가 계속 보인다. 기존 콘텐츠와 이후 새 콘텐츠에 동일하게 적용한다.

### 6-4. 알림 (#104, 전부 private, 목록은 RPC로만)

```
private.notifications
  id, recipient_id FK profiles cascade, type notification_type, post_id FK posts cascade,
  title, body, event_key text unique, created_at, push_sent_at null

private.like_notification_log  (post_id, actor_id) PK, created_at
```

처음엔 notifications를 public에 두고 select만 열 생각이었는데, 알림을 눌렀을 때 글이 지워졌는지(NOTI-006)를 앱이 알아야 해서 private.posts를 같이 봐야 했다. 그래서 커뮤니티처럼 원본은 private에 두고 `get_notifications(after_created_at, after_id)`로만 읽는다.

- 알림은 쓰기 RPC를 고치지 않고 트리거로 만든다. 댓글은 `comments` insert, 좋아요는 `post_likes` insert 때 돈다. 댓글 재시도는 기존 댓글을 돌려줘 insert가 없고, 좋아요는 on conflict do nothing이라 이미 누른 상태면 트리거가 돌지 않는다.
- 일반 게시글만 알린다(NOTI-004·005). 본인 댓글·본인 좋아요, 받는 사람이 차단·신고한 사용자의 행동, 지워지거나 숨겨진 글은 알리지 않는다.
- 좋아요는 같은 사람·같은 글에 최초 1회. like_notification_log에 on conflict do nothing으로 넣고 들어갔을 때만 알림을 만든다. 취소하거나 알림이 30일 지나 지워져도 기록은 남겨 다시 보내지 않는다.
- 투표 마감은 pg_cron `notifications-vote-ended`가 1분마다 `ends_at`이 지난 투표를 찾아 작성자에게 만든다(NOTI-003). 마감 전에 지워진 글은 건너뛴다. 작업이 밀려도 놓치지 않게 시각 범위가 아니라 event_key로 중복을 막는다.
- event_key는 `comment:{comment_id}`, `like:{post_id}:{actor_id}`, `vote_ended:{post_id}`. 앱에는 주지 않는다.
- 제목·본문은 만들 때 정해 저장한다. 줄바꿈은 공백으로 바꾸고 글자 수는 자르지 않는다(Push 줄 수는 OS에 맡긴다).
- 목록은 최근 30일, 최신순 20개씩. 알림은 항상 받는 사람 자신의 글이라 `is_post_available`은 삭제·숨김만 본다. 읽음 상태는 없다.
- pg_cron `notifications-cleanup`이 매일 03:00(KST)에 30일 지난 알림을 지운다.
- 알림 종류별 수신 설정은 없다(MY-011 MVP 제외). 수신 설정·OS 권한과 관계없이 알림은 목록에 남긴다(NOTI-007).
- Push 발송은 다음 작업이다. 사용자의 토큰 전체에 보내고, DeviceNotRegistered면 토큰을 지우고, push_sent_at이 null이면 다음 실행 때 다시 보낸다.

### 6-5. 운영 (private, Edge Function의 service_role만)

```
admin_users    id, email unique, role admin_role, created_at, disabled_at null
admin_actions  id, admin_id, action, target_type, target_id, report_id null, reason 필수,
               before_state jsonb, after_state jsonb, created_at   INSERT-only
```

- admin_actions는 update·delete를 막는 트리거를 건다. 조치와 로그 insert는 한 함수에서 같이 실행한다.
- 운영자 숨김(hidden_at)만 복구할 수 있다. 작성자 삭제(deleted_at)는 복구하지 않는다.

## 7. 제재 (RPT-006)

- warning: 기능 제한 없이 이력과 안내만.
- community_restricted: restricted_until = 제재 시각 + 7×24시간(UTC). 커뮤니티 읽기 전용. 쓰기 RPC(create_post, set_community_vote, set_community_like, create_comment, update_comment, delete_comment)는 공통 가드 `private.assert_can_write_community()`를 먼저 부른다. #95의 본인 게시글 삭제는 콘텐츠 정리를 위해 예외로 허용한다. 신고·차단·조회는 허용. 만료는 매 요청 시 확인하고 해제 배치는 없다.
- suspended: profiles.status 변경과 함께 Supabase Auth 계정 정지(ban)와 전체 세션 무효화를 한다. status만으로는 상품·폴더 접근을 못 막기 때문이다. 해제할 때 둘 다 푼다.

## 8. 탈퇴 (MY-007, Edge Function)

1. 설문을 private.withdrawal_surveys에 저장한다(user_id 없음).
2. 사용자 댓글 content를 null로 바꾼다.
3. Storage avatars/{user_id}/ 파일을 지운다.
4. 세션을 전부 로그아웃시킨다(사용자를 지워도 발급된 access token은 만료 전까지 살아 있다).
5. auth.users를 지운다. FK가 처리한다.
   - cascade: profiles, products, folders, product_folders, import_*, posts(와 그 글의 하위 데이터), notifications, push_tokens, user_policy_consents, user_blocks, like_notification_log
   - set null: comments.author_id, vote_responses.user_id, post_likes.user_id, reports.reporter_id

## 9. DB에 두지 않는 것

최근 검색어(기기 저장), 온보딩 완료 여부, 로그인 전 공유 임시 데이터, 툴팁·첫 진입 안내 노출 여부, Analytics, 추천.

## 10. 확인 필요 (PM·팀 결정 대기)

- 가입 시 약관 동의 화면이 명세에 없다. 처음 동의 기록을 언제 만들지(MY-009)
- 닉네임 "한글"에 자음·모음 단독(ㄱ, ㅏ)을 허용할지. 지금은 허용하지 않는다
- 차단 해제 화면 없음. 차단 방향은 RPT-004 단방향으로 확정했으며, 앱 모달의 "서로의 게시글" 문구는 후속 작업에서 맞춘다.
- 관리자 인증 방식, CSV 처리 위치(Edge Function / 클라이언트 + RPC), import 실패 사유 코드 추가 여부
- CSV 한도 초과 시 신규 버킷 선택 순서: 기존 DB 설계는 상품 많은 순, 현재 CSV 저장 계획은 최초 등장 순이다. 이번에 구체화된 기준에는 우선순위가 없어 추가 확인한다.
- IMP-005 원화 판별 규칙 미완료: 검증된 스토어·도메인 목록을 PM과 확정해야 한다. 현재 실사용 CSV 가격은 모두 null이다.
- IMP-006의 기존 정보 유지와 PDT-008의 소장 시 위시레벨 제거가 충돌한다. 현재 소장 Y를 추가하면 공통 규칙대로 위시레벨을 비우며, 명세 예외를 PM과 확인한다.
- IMP-008 예시는 공백 포함 7자 구현과 다르다. 구현 기준은 사용자 확인을 받았으나 명세 예시·QA 기준은 PM과 통일한다.
- 운영자가 숨긴 글을 작성자 본인에게 보여줄지, 작성자가 지운 글·댓글 원문 보관 기간
- URL 정규화 규칙(쿼리스트링, 끝 슬래시)
- 기능명세 문구 수정 요청: FLD-002 색상·중복명 허용, IMP-008 중복 허용, SAVE-002·004·IMP-007 HTTP(S)
