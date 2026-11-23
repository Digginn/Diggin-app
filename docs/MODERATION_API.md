# 관리자 신고·제재 API (#114)

RPT-005~006 구현. Retool 화면 구성은 #115에서 이 API에 연결한다. 선행 구현은 #112(신고·차단), #116(안내 UI)이다.

## 공지 관리 (#229)

동일 `admin-moderation` API에 `action: "notice"`를 보낸다. 관리자 인증과 활성 세션 재검사는 신고·제재 API와 같다. 브라우저에는 공개 키와 로그인 세션만 사용한다.

| operation    | 입력                                                         | 응답                     |
| ------------ | ------------------------------------------------------------ | ------------------------ |
| `list`       | `payload: {page: 1}`                                         | `{total, rows}` (20건씩) |
| `get`        | `notice_id` (문자열)                                         | 공지 1건                 |
| `create`     | `request_id`, `payload`                                      | 새 공지                  |
| `update`     | `notice_id`, `request_id`, `payload`                         | 수정 공지                |
| `visibility` | `notice_id`, `request_id`, `payload: {revision, is_visible}` | 공개/숨김 결과           |
| `delete`     | `notice_id`, `request_id`, `payload: {revision}`             | 삭제 결과                |

작성·수정 payload는 `title`, `body`, `inbox_body` 문자열과 `inbox_only`, `comments_closed` 불리언을 모두 받는다. 수정 시 조회한 `revision`도 전달한다. 제목 100자, 본문 10,000자, 요약 200자이며 제목·본문은 필수다. 요약을 비우면 앱이 게시글 본문을 두 줄까지 표시한다. 내용은 HTML이 아닌 일반 텍스트다.

공지 요청만 256KiB까지 받고 기존 작업의 16KiB 제한은 유지한다. 수정 충돌은 `notice_revision_conflict`(409), 동일 UUID의 요청 변경은 `notice_request_conflict`(409)다. 응답이 유실되면 같은 UUID·동일 본문으로 결과를 확인한다. 웹은 새로고침 후에도 미확인 작성 요청을 복구하며 중복 등록하지 않는다. 숨김·삭제된 공지는 앱의 다음 조회에서 제외한다.

공지 등록 시 푸시는 발송하지 않는다. 기본은 DIGGLE 상단 최신 공지와 앱 알림함 노출이며, `inbox_only=true`이면 DIGGLE 상단에서 제외한다. `comments_closed=true`이면 댓글·입력창을 숨기고 서버에서 새 댓글·수정을 거부한다.

배포는 DB → Edge Function → 앱/OTA·관리자 웹 순서다. 기존 앱이 사용하는 `get_notifications` 응답·커서는 변경하지 않는다.

## 인증

`POST /functions/v1/admin-moderation`에 `Authorization: Bearer <관리자 Supabase Auth access token>`과 `Content-Type: application/json`을 보낸다. Retool에는 앱의 publishable 키와 관리자 세션만 사용하며 service_role/secret 키를 전달하지 않는다.

- 함수는 `getUser(token)` 검증 후 JWT의 사용자·세션 ID를 서버 RPC에 전달한다. 본문으로 운영자를 지정할 수 없다.
- RPC는 `service_role`에만 실행 권한을 준다. 일반 사용자·비회원은 직접 실행할 수 없다.
- 매 요청에서 `private.admin_users`의 operator/super_admin, disabled_at, 실제 Auth 세션·만료·ban·프로필 상태를 확인한다. 사용자 수정 가능한 user_metadata는 권한 판단에 사용하지 않는다.
- 관리자 원본 테이블은 service_role에도 직접 권한을 주지 않는다. 필요한 접근은 RPC로 제한한다.
- 요청은 16KiB까지 읽는다. 응답은 `Cache-Control: no-store`이며 키·토큰·SQL 상세를 로그에 남기지 않는다.

## 요청 본문

ID(bigint)는 문자열로 보낸다. 변경 요청의 `request_id`는 새 UUID를 만들고, 응답 유실로 같은 동작을 재시도할 때 유지한다. 같은 키로 내용을 바꾸면 400이다. 정상 실패로 종료된 제재 요청을 새로 시도할 때는 새 키를 사용한다.

### 관리자 웹 추가 요청 (#224)

- `action: "console"`, `resource: "session"` → 검증된 관리자 `{id,email,role}`. UI 진입 때 권한을 확인하며 이후 모든 RPC에서도 재검사한다.
- `resource: "reports"` → `{total,counts,rows}`. `query`(최대 100자, 문자 그대로 부분 검색), `status`(all/received/reviewing/resolved/rejected), `type`(all/post/comment), `page`(1부터, 20건)를 받는다. 전체 요약은 콘텐츠 그룹별이며 필터와 별개다. 그룹 상태 우선순위는 received → reviewing → resolved → rejected다. ID는 모두 문자열로 반환한다.
- `resource: "report_detail"`, `report_id` → 기존 상세 + `author_name`, `group_status`, `report_count`. 개별 신고는 기존 `report_detail`의 `before_report_id`로 50건씩 추가 조회한다. 콘텐츠 조치 이력은 해당 콘텐츠의 다른 신고에서 수행한 조치도 포함한다.
- `resource: "members"` → `{total,rows}`. query/page 지원(8건씩, #235). 이메일·Auth 메타데이터는 노출하지 않고 UUID·닉네임·가입/최근 로그인·활동/신고/보관 제재 수·실효 계정 상태만 반환한다. 기간 만료된 커뮤니티 제한은 정상으로 표시한다.
- `resource: "sanctions"` → `{total,rows}`. query/page 지원(8건씩). 제재·사유·기간·해제 여부와 관련 신고 ID, 보관 유지 여부(`is_held`), 처리한 운영자 이메일(`handled_by`, 운영자가 직접 해제한 제재는 해제한 운영자)을 반환한다(#235). 보관 정책에 따라 삭제된 과거 제재는 집계하지 않는다.
- `action: "report_group_status"`, `report_id`, `request_id`, `status`, `reason_category`, `reason` → `{action_id}`. 동일 콘텐츠의 미완료 신고를 하나의 트랜잭션으로 상태 변경한다. 접수는 reviewing으로만, 접수가 없는 검토 중 그룹은 resolved/rejected로 변경한다. 이미 완료된 신고는 보존한다. 서버 상태가 달라졌으면 409로 거부한다. 동일 UUID 재시도는 최초 결과를 반환하며 다른 본문은 거부한다. underage는 사용할 수 없다.

조회 RPC `admin_console`과 일괄 상태 RPC `admin_report_group_status`는 기존 패턴대로 public invoker → private definer이며 service_role만 실행한다. 회원·제재·신고 목록 조회는 `private.admin_console_access_logs`에 운영자·화면·시각·실제 반환한 회원 UUID를 기록하고 기존 정리 작업이 1년 후 삭제한다. 상세 조회도 반환한 작성자·신고자 UUID를 기록한다. 두 로그의 `session_ip`는 검증한 Auth 세션의 로그인 당시 IP이며 현재 요청 IP와 다르다. 검색어·비밀번호·토큰은 기록하지 않는다. 요청 IP의 신뢰 가능한 수집 및 최종 접속기록 기준 확정은 남아 있다.

웹 설정·전환 절차와 분석 동의 철회·보관 유지 화면의 신규 추가 범위는 [admin/README.md](../admin/README.md)를 따른다. 두 API는 DIGGIN 서버 코드에 있으며, 사용자 제공 Retool 코드 검색 결과에는 해당 화면·쿼리·호출이 없다.

| action                     | 추가 필드                                                          | 결과                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| list_reports               | before_id?                                                         | 콘텐츠별 신고 수·사유별/상태별 수·최초/최근 시각. 최신 신고 ID 역순 50그룹                                                                                                                                                                    |
| report_detail              | report_id, before_report_id?                                       | 원문·soft delete 상태·댓글 신고 Snapshot·작성자 UUID·제재/감사 이력·같은 콘텐츠의 신고 50건                                                                                                                                                   |
| report_status              | request_id, report_id, status, reason_category, reason             | received → reviewing → resolved/rejected. 같은 상태 재요청은 동일 키일 때만 성공                                                                                                                                                              |
| hide / restore             | request_id, report_id, reason_category, reason                     | 운영자 숨김·복구. 작성자 삭제는 복구하지 않음                                                                                                                                                                                                 |
| sanction                   | request_id, user_id, sanction, reason_category, reason, report_id? | warning / community_restricted / suspended / release                                                                                                                                                                                          |
| sanction_request           | request_id                                                         | 본인이 시작한 제재 요청의 pending/applied/failed와 action_id 조회                                                                                                                                                                             |
| retention_hold             | target_type(report/sanction), target_id, held(true/false)          | 이의제기·분쟁 중인 신고·제재를 보관기간 자동 삭제에서 빼거나(true) 다시 넣음(false)                                                                                                                                                           |
| withdraw_analytics_consent | email, usage_analysis?, overseas_transfer?                         | 이용 기록 분석 동의 철회 메일을 보낸 회원의 선택 동의를 미동의로 바꾸고 Amplitude 삭제를 요청(#156). 두 항목 값을 함께 보내면 true인 항목만 철회하고, 생략하면 두 항목을 모두 철회(#233). 없는 이메일 404, 같은 이메일 계정이 둘 이상이면 409 |

`reason_category`: abuse, spam, inappropriate, other, underage. underage(만 14세 미만)는 `suspended`·`release`에만 허용하며 앱은 제재 안내 대신 MSG-AUTH-007 이용 중단 안내를 띄운다. `reason`: 공백만으로 구성되지 않은 1~1000 사용자 인식 문자. 사용자 안내에는 유형만 표시하고 상세 사유는 공개하지 않는다. 신고 수에 따른 자동 숨김·삭제·제재·단계 상승은 없다.

```json
{
  "action": "sanction",
  "request_id": "11400000-0000-0000-0002-000000000001",
  "user_id": "11400000-0000-0000-0000-000000000002",
  "sanction": "community_restricted",
  "reason_category": "spam",
  "reason": "검토한 근거와 조치 사유"
}
```

제재 성공은 `state: applied`, 감사 ID `action_id`를 반환한다. 다른 요청이 대상 사용자에게 진행 중이면 409 `sanction_request_pending`이다. 같은 관리자의 같은 request_id로 재시도하거나 상태를 조회한다. 취소·실패 이후 새 요청은 새 키를 사용한다.

## 제재와 감사 기록의 원자성

1. `admin_prepare_sanction`은 인증·사유·대상을 검사하고 요청만 저장한다. 계정 상태는 바꾸지 않는다.
2. Edge가 Auth Admin `updateUserById`로 app_metadata의 `moderation_request_id`를 전달한다. 영구 제한은 `ban_duration: 876000h`, 해제는 `none`을 함께 전달한다.
3. `auth.users`의 **DEFERRABLE INITIALLY DEFERRED** 트리거가 Auth 트랜잭션 종료 시 최종 ban 상태를 확인하고 프로필·제재·감사 기록을 함께 확정한다. Auth는 metadata와 ban을 별도 UPDATE로 저장하므로 즉시 트리거로 처리하지 않는다. Auth 관리 컬럼의 구조·타입을 변경하지 않는다.
4. 영구 제한은 같은 트랜잭션에서 모든 Auth 세션을 제거한다. 프로필 suspended는 만료일 없이 수동 해제만 허용한다. 미만료 JWT도 RLS·RPC 공통 가드로 거부한다. 해제 후에도 종료된 세션은 되살아나지 않는다.
5. Auth 실패는 DB 상태와 감사 기록도 롤백한다. 응답만 유실됐다면 저장된 applied 결과로 복구한다. 미적용 요청은 행 잠금 안에서 failed로 바꿔 이후 지연된 Auth 트랜잭션도 확정하지 못하게 한다. 결과 확인 자체가 실패하면 성공을 가정하지 않고 같은 키로 조회·재시도한다.

`admin_actions`는 UPDATE·DELETE·TRUNCATE를 트리거로 거부한다. 운영자·사유·전후 상태·신고 ID·시각·request_id를 남긴다. 제재 확인 기록은 별도 `user_sanctions.notice_seen_at`에 저장한다. 운영자 계정은 삭제 대신 비활성화한다.

## 앱 연결

- `get_account_access()`는 본인 상태·종료일·현재 제재 ID·위반 유형·확인 시각만 반환한다. `acknowledge_sanction_notice(sanction_id)`는 본인 현재 경고/기간 제한만 확인하며 최초 확인 시각을 보존한다.
- `AccountAccessNotice`는 경고/기간 제한을 DIGGLE 최초 진입에 안내한다. 확인 저장 실패 시 모달을 유지한다. 새 제재는 이전 건의 확인 여부와 별개다. 해제된 이전 제재는 다시 안내하지 않는다. 7일 제한 중 받은 경고는 제한이 끝난 뒤 아직 확인하지 않았으면 경고로 안내한다(#235).
- 기간 제한 중 모든 커뮤니티 변경 RPC는 종료일을 포함한 `community_restricted`를 반환한다. 본인 글 삭제도 포함한다. 조회·신고·차단·상품·폴더·MY는 유지하고 매 요청에 만료를 확인한다.
- 앱은 변경 전 서버 상태를 확인해 제한 요청을 전송하지 않으며 입력을 유지하고 날짜가 포함된 MSG-REPORT-008을 표시한다. 사전 확인과 실제 변경은 같은 계정 토큰으로 실행한다.
- 영구 제한은 어느 화면에서든 안내·로컬 세션 종료·비회원 로그인 화면 전환을 처리한다. 화면 이동·앱 복귀 시 상태 재확인과 SDK 세션 종료 이벤트를 사용하며, 주기 조회는 하지 않는다. 재조회 중에도 기존 경고·7일 제한 안내를 유지하고 확인 완료·제한 해제 응답에 따라 닫는다. 이전 JWT가 유효한 동안에는 본인 안내만 조회할 수 있다.
- Auth가 로그인을 거부하면 Google·Kakao·네이티브 Apple의 제공자 ID token을 `account-restriction`에 보내 기본 위반 유형만 확인한다. 서버는 서명·issuer·앱 audience·만료를 검증하고 해당 identity에만 응답한다. 이메일이나 UUID로 조회하는 공개 API는 없다.
- Apple 로그인은 iOS에서만 제공하며 Android에서는 버튼과 인증 실행을 차단한다.
- **사유 조회 실패** 시 유형을 추측하지 않고 `1:1 문의로 확인해 주세요.`를 표시한다. JWT가 이미 만료된 채 세션이 종료되어 본인 상태를 조회할 수 없으면 기존 인증 만료 안내를 사용하며, 로그인 시도 시 영구 제한을 안내한다. 이 안내 흐름은 2026-10-21 사용자 확인으로 유지하며, 실제 기기 QA가 남아 있다.

## 배포 전 설정

1. 기존 GitHub Environment `shared-development`의 `SUPABASE_ACCESS_TOKEN`에 대상 프로젝트 **Edge Functions / Read-write** 권한이 필요하다. DB 연결 권한은 기존 Session pooler 비밀번호 방식을 유지한다.
2. Supabase Dashboard → Edge Functions → Secrets에 아래 audience를 쉼표로 구분해 등록한다. 토큰이나 사용자 정보가 아닌 앱 식별자이며, wildcard는 사용하지 않는다. 설정이 없으면 본인 제재 사유 조회를 거부한다.

| 이름                  | 값                                                                       |
| --------------------- | ------------------------------------------------------------------------ |
| GOOGLE_OIDC_AUDIENCES | 실제 Google ID token의 aud인 OAuth client ID(사용하는 Web/iOS client ID) |
| KAKAO_OIDC_AUDIENCES  | 사용하는 Kakao 앱의 ID token aud에 해당하는 앱 키                        |
| APPLE_OIDC_AUDIENCES  | 네이티브 Bundle ID, 사용하는 경우 Apple Service ID                       |

3. 프로젝트 담당자가 Supabase Auth에 확인된 운영자 계정을 만들고, 승인된 데이터 등록 절차로 `private.admin_users`에 그 계정 UUID·이메일·operator/super_admin을 등록한다. 이메일 도메인이나 user_metadata로 자동 승격하지 않는다. 앱 일반 사용자 UUID를 운영자로 잘못 등록하지 않는다.
   - #224 개발용 계정은 `20261121031503_register_development_admin_accounts.sql`로 등록한다. 사용자가 지정한 `diggin.app@gmail.com`(개발 UID `25230b16-95fa-469c-86ef-35ed8cda0f3f`)·`digginmanagertest@gmail.com`(개발 UID `36ff500f-f715-4c06-9dba-904edda79f1c`)을 개발 프로젝트의 Auth Admin API로 별도 생성했다. 지정한 UID·이메일, 이메일 확인 완료·비밀번호 설정까지 검사한 뒤 `operator`로 등록하고 기존 권한·비활성화 상태는 유지한다. 운영 DB에는 해당 개발 UUID가 없어 적용하지 않는다. 비밀번호·서비스 키는 Git에 저장하지 않는다. 승인·개발 배포 후 두 계정으로 권한 확인·목록 조회를 검증한다.
   - #175 Retool 전용 테스트 계정은 `20261102135701_register_retool_test_operator.sql`로 등록한다. UID `95fece6b-9373-430b-8547-61eef81903e1`·이메일 `digginmanagertest@gmail.com`이 일치하고 이메일 확인이 끝난 계정만 `operator`로 추가한다. 기존 권한·비활성화 상태는 보존한다. 앱 심사용 계정은 관리자로 등록하지 않는다. 사용자 지시에 따라 PR #177과 해당 브랜치에 한해 팀원 승인 없이 관리자 병합·배포를 허용한다. 다른 PR의 승인 검사는 유지한다. 배포가 끝나면 테스트 계정으로 로그인하여 `list_reports`를 확인한다.
   - #115 최초 Retool 계정은 `20261021173103_register_retool_operator.sql` 데이터 마이그레이션으로 등록한다. 지정한 UID의 이메일 확인이 완료된 Auth 계정만 `operator`로 추가하며, 계정이 없는 로컬/CI에서는 건너뛴다. 기존 운영자의 권한·비활성화 상태는 바꾸지 않는다. PR 승인·병합 후 자동 배포가 끝나야 Retool에서 관리자 API를 사용할 수 있다.
   - #121은 승인 리뷰 없이 병합되어 배포의 승인 검사에서 중단됐다. 사용자 지시에 따라 복구 PR #122만 팀원 승인 예외로 배포하며 다른 PR의 승인 조건은 유지한다. DB 등록 SQL은 직접 실행하지 않는다. #122의 `deploy` 성공 후 Retool 관리자 로그인과 `list_reports` 성공을 확인한다. 신고가 없어 빈 배열이 반환되어도 정상이며, 403이면 Auth 이메일 확인과 해당 UID의 운영자 등록·비활성화 상태를 확인한다.
4. 승인된 PR을 develop에 병합하면 기존 검증과 DB 배포 후 두 Edge Function을 배포한다. 함수 배포 실패는 Actions 실패로 남기며 설정을 고쳐 같은 실행을 다시 실행한다. API 설정·관리자 계정·audience 값은 코드에서 임의 생성하지 않는다.
5. 만 14세 미만 자동 삭제(#164)를 켜려면 운영자가 충분히 긴 임의 비밀값을 만들어 `underage-cleanup` 함수 secret `UNDERAGE_CLEANUP_SECRET`으로 등록하고, Vault에 같은 값을 `underage_cleanup_secret`, 함수 주소 `https://<project-ref>.supabase.co/functions/v1/underage-cleanup`를 `underage_cleanup_url`로 등록한다. 설정이 없으면 함수는 503, DB cron은 호출 없이 종료한다. `apple-token`·`underage-cleanup`은 탈퇴와 같은 `APPLE_PRIVATE_KEY`·`APPLE_KEY_ID`·`APPLE_TEAM_ID` secret을 쓴다. Retool 제재 화면의 사유 목록에 `underage`(만 14세 미만)를 추가해야 운영자가 고를 수 있다.
6. Amplitude 데이터 삭제(#156)를 켜려면 Amplitude 프로젝트의 API 키·시크릿 키를 `amplitude-deletion` 함수 secret `AMPLITUDE_API_KEY`·`AMPLITUDE_SECRET_KEY`로 등록한다. 시크릿 키는 앱·Git에 넣지 않는다. 충분히 긴 임의 비밀값을 `AMPLITUDE_DELETION_SECRET`으로 등록하고, Vault에 같은 값을 `amplitude_deletion_secret`, 함수 주소 `https://<project-ref>.supabase.co/functions/v1/amplitude-deletion`를 `amplitude_deletion_url`로 등록한다. 설정이 없으면 함수는 503, DB cron은 호출 없이 종료하고 삭제 요청은 대기열에 남는다. 관리자 웹의 분석 동의 철회 화면(`#/analytics-consent`)에서 철회 메일 주소와 항목을 골라 `withdraw_analytics_consent`를 부른다(#233).

## 로컬 검증

- `npm run test:community`, `npm run test:moderation`, 타입·린트 검사
- `supabase db reset --local --no-seed`, `supabase test db --local`, DB lint·Advisors, public 타입 재생성
- #115 등록 데이터 검증: 전체 마이그레이션을 적용한 **별도 로컬 임시 DB**에서 `pg_prove --dbname "$LOCAL_TEST_DB_URL" scripts/check_retool_operator.sql`을 실행한다. 실제 등록 마이그레이션을 읽어 계정 누락·이메일 미확인·정상 등록·타 계정 제외·재실행을 검사하고 롤백한다. 이 검사는 공유/운영 DB에서 실행하지 않는다.
- `deno test --allow-net --config supabase/functions/deno.json supabase/functions/admin-moderation/handler_test.ts supabase/functions/account-restriction/identity_test.ts`
- `scripts/check_moderation_auth.cjs`: **project_id diggin-114, API 55481 / DB 55482** 전용 임시 환경에서만 실행. `MODERATION_TEST_WORKDIR`, `DENO_BIN`을 지정한다. Deno 테스트 서버가 기본 포트 8000을 쓰므로 다른 서비스가 없는지 확인한다. 실제 Auth API·동시 요청·강제 롤백·ban·갱신 차단·미만료 JWT·해제를 검증한다. 테스트 계정과 변경 불가 감사 기록을 생성하며 검증 후 해당 임시 DB만 reset/stop으로 제거한다.

공식 참고: [Supabase Auth 세션](https://supabase.com/docs/guides/auth/sessions), [Admin 사용자 변경](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [토큰 권한](https://supabase.com/docs/guides/platform/personal-access-tokens), [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect), [Kakao OIDC](https://developers.kakao.com/docs/ko/kakaologin/utilize), [Apple 검증](https://developer.apple.com/documentation/signinwithapple/verifying-a-user).
