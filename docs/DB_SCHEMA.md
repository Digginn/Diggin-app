# DIGGIN DB 스키마 설계 기준

이 문서는 DIGGIN DB의 최종 설계와 구현 방식을 정리한다. DB 작업 절차는 `docs/DB_RULES.md`를 따르고, 무엇을 어떤 모양으로 만들지는 이 문서를 따른다.

- 설계 원본: FigJam '스키마 최종 · 2026.10.14' 영역 (25개 테이블, 관계선, enum, 핵심 규칙)
- 기준 명세: 기능명세서 2026.10.14 변경이력까지
- 구현 위치: `supabase/schemas/` (선언형 스키마, 실제 기준은 이 SQL 파일)
- 이 문서와 SQL이 다르면 SQL이 맞다. 설계를 바꾸면 SQL과 이 문서를 같은 PR에서 같이 고친다.

## 1. 진행 상황

| 영역           | 테이블                                                                                                                         | 상태                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 계정·MY        | profiles, nickname_banned_words, nickname_allowed_words, withdrawal_surveys, legal_policies, user_policy_consents, push_tokens | 구현 (#71)                                                    |
| 폴더           | folders                                                                                                                        | 구현 (#71). 가입 시 나의 소장템을 만들어야 해서 먼저 넣었다   |
| 아이템·CSV     | products, product_folders, import_jobs, import_failures                                                                        | products, product_folders 구현 (#78). import_*는 CSV 작업에서 |
| 커뮤니티       | posts, post_products, vote_responses, post_likes, comments, post_anon_numbers                                                  | 미구현                                                        |
| 신고·알림·운영 | reports, user_blocks, notifications, like_notification_log, admin_users, admin_actions                                         | 미구현                                                        |

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
import_status       processing | completed | failed
import_fail_reason  EMPTY_PRODUCT_NAME | EMPTY_PRODUCT_URL | INVALID_PRODUCT_URL | CSV_ROW_PARSE_ERROR
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
- product_folders: 앱은 일반 폴더만 직접 담기(insert)·빼기(delete). 나의 소장템은 `set_owned`로만. 담으면 `folders.last_added_at`을 담은 시각으로 바꾸고, 빼도 되돌리지 않는다.
- 소장템 상품에 위시레벨을 넣거나, 위시레벨 있는 상품을 소장템에 담으면 `owned_product_wish_level`(P0001)로 막는다.

## 6. 남은 테이블 설계

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

product_folders
  product_id, folder_id  PK
  user_id     uuid not null
  created_at  timestamptz not null default now()
  FK (product_id, user_id) → products(id, user_id) on delete cascade
  FK (folder_id, user_id)  → folders(id, user_id) on delete cascade
  index (folder_id, created_at desc)

import_jobs
  id, user_id, status import_status default 'processing',
  total_count, success_count, failed_count, duplicate_count (integer default 0),
  started_at timestamptz default now(), finished_at timestamptz null

import_failures
  id, job_id FK import_jobs on delete cascade, user_id, row_number integer,
  product_name text null, reason import_fail_reason
```

- products 앱 grant: select, delete, update(name, brand, price, wish_level). insert는 RPC `save_product`로만(상품과 폴더 관계를 한 트랜잭션에, 중복 URL이면 기존 id 반환).
- 상품명·브랜드 초과: 직접 입력·수정은 거부, 자동 추출·CSV는 상한까지 자른다(이모지 중간에서 자르지 않음).
- 나의 소장템에 든 상품에 wish_level을 넣으면 트리거로 막는다. 소장 추가·해제는 RPC `set_owned`로만(PDT-008).
- product_folders insert 시 folders.last_added_at을 now()로 갱신하고, 빼거나 지워도 되돌리지 않는다(FLD-001 "상품 삭제는 순서를 바꾸지 않는다"). 많이 담은 순은 관계 개수로 센다.
- 복합 FK라 남의 폴더에 내 상품을 넣는 행은 DB가 거부한다.
- CSV 폴더명은 서버가 들어오자마자 최종 이름으로 저장한다. 7자로 자르고, 기존 폴더나 먼저 만든 폴더와 겹치면 6자 + 2부터 번호(10번째부터 5자 + 두 자리). 원래 버킷명은 저장하지 않는다. 폴더 50개를 넘는 버킷은 폴더 없이 ALL에만 넣고, 50개 안에서는 상품 많은 버킷부터 만든다.

### 6-2. 커뮤니티 (전부 private, 앱 grant 없음)

```
posts
  id, author_id uuid not null FK profiles on delete cascade   탈퇴 시 글 삭제(MY-007)
  type post_type, content text
  ends_at timestamptz null                  투표만, created_at + 24h
  deleted_at, hidden_at timestamptz null, hidden_by FK admin_users null
  created_at, next_anon_number integer not null default 1
  content: 공백 제외 일반 5~30자(DGL-005), 투표 5~50자(VOTE-002), 공백 포함 100자 상한, char_count 기준

post_products   (post_id, position 1~4) PK, name, brand, price integer, url, image_url
vote_responses  id, post_id, user_id null(탈퇴 후), choice, created_at, updated_at, unique (post_id, user_id)
post_likes      id, post_id, user_id null(탈퇴 후), created_at, unique (post_id, user_id)
comments        id, post_id, author_id null(탈퇴 후), content 1~30자(줄바꿈 1자) 탈퇴 후 null,
                deleted_at, hidden_at, hidden_by, created_at, updated_at(논의)
post_anon_numbers  (post_id, user_id) PK, number, unique (post_id, number)
```

- post_products는 `create_post`가 본인 상품에서 값을 복사한다. 원본 product_id는 저장하지 않는다. 일반글 1~4개, 투표글 정확히 1개.
- 수정 RPC는 없다(DGL-008). 삭제는 deleted_at, 댓글도 같이 soft delete. 투표글 삭제 시 vote_responses는 실제로 지운다.
- `vote`는 upsert. 투표글인지, 삭제·숨김 아닌지, 서버 `now() < ends_at`, 본인 글 아닌지, 커뮤니티 제한 아닌지 순서로 검사.
- 투표 결과는 참여한 사람에게만 보인다(VOTE-009). 조회 RPC가 본인 vote_responses가 없으면 buy_count·not_count를 null로 돌려준다. 퍼센트는 앱이 계산한다.
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

### 6-4. 알림 (notifications는 public select만, 나머지 private)

```
notifications
  id, recipient_id FK profiles, type, post_id FK posts, title, body,
  created_at, event_key text unique, push_sent_at null

like_notification_log  (post_id, actor_id) PK, created_at
```

- 알림 종류별 수신 설정은 없다(MY-011 MVP 제외). 목록은 최근 30일만 보이고(조회에서 거름), pg_cron이 하루 한 번 30일 지난 행을 지운다. 읽음 상태 없음.
- event_key는 수신자 + 유형 + 원본 이벤트 ID. Push 워커 재시도 중복을 막는다. 앱 select 컬럼에서 뺀다.
- 좋아요 알림은 같은 사람·같은 글에 최초 1회. `like_post`가 like_notification_log에 on conflict do nothing으로 넣고, 들어갔을 때만 알림을 만든다. 취소해도 지우지 않는다.
- 본인 댓글·본인 좋아요는 알림 없음. 투표 마감 전에 글이 삭제되면 종료 알림을 만들지 않는다.
- Push는 사용자의 토큰 전체에 보낸다. 발송 결과가 DeviceNotRegistered면 토큰을 지운다. push_sent_at이 null이면 다음 실행 때 다시 보낸다.

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
- community_restricted: restricted_until = 제재 시각 + 7×24시간(UTC). 커뮤니티 읽기 전용. 쓰기 RPC(create_post, delete_post, vote, like_post, unlike_post, create_comment, update_comment, delete_comment)는 공통 가드 `private.assert_can_write_community()`를 먼저 부른다. 신고·차단·조회는 허용. 만료는 매 요청 시 확인하고 해제 배치는 없다.
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

- 투표 결과를 투표할 수 없는 작성자와 마감 후 미참여자에게 보여줄지(VOTE-009)
- 가입 시 약관 동의 화면이 명세에 없다. 처음 동의 기록을 언제 만들지(MY-009)
- 닉네임 "한글"에 자음·모음 단독(ㄱ, ㅏ)을 허용할지. 지금은 허용하지 않는다
- 차단 방향(단방향 명세 vs 앱 모달 문구 "서로의 게시글"), 차단 해제 화면 없음
- 관리자 인증 방식, CSV 처리 위치(Edge Function / 클라이언트 + RPC), import 실패 사유 코드 추가 여부
- 운영자가 숨긴 글을 작성자 본인에게 보여줄지, 작성자가 지운 글·댓글 원문 보관 기간
- URL 정규화 규칙(쿼리스트링, 끝 슬래시)
- comments.updated_at: 화면에 '수정됨' 표시가 없으면 뺀다
- 기능명세 문구 수정 요청: FLD-002 색상·중복명 허용, IMP-008 중복 허용, SAVE-002·004·IMP-007 HTTP(S)
