# 관리자 신고·제재 API (#114)

RPT-005~006 구현. Retool 화면 구성은 #115에서 이 API에 연결한다. 선행 구현은 #112(신고·차단), #116(안내 UI)이다.

## 인증

`POST /functions/v1/admin-moderation`에 `Authorization: Bearer <관리자 Supabase Auth access token>`과 `Content-Type: application/json`을 보낸다. Retool에는 앱의 publishable 키와 관리자 세션만 사용하며 service_role/secret 키를 전달하지 않는다.

- 함수는 `getUser(token)` 검증 후 JWT의 사용자·세션 ID를 서버 RPC에 전달한다. 본문으로 운영자를 지정할 수 없다.
- RPC는 `service_role`에만 실행 권한을 준다. 일반 사용자·비회원은 직접 실행할 수 없다.
- 매 요청에서 `private.admin_users`의 operator/super_admin, disabled_at, 실제 Auth 세션·만료·ban·프로필 상태를 확인한다. 사용자 수정 가능한 user_metadata는 권한 판단에 사용하지 않는다.
- 관리자 원본 테이블은 service_role에도 직접 권한을 주지 않는다. 필요한 접근은 RPC로 제한한다.
- 요청은 16KiB까지 읽는다. 응답은 `Cache-Control: no-store`이며 키·토큰·SQL 상세를 로그에 남기지 않는다.

## 요청 본문

ID(bigint)는 문자열로 보낸다. 변경 요청의 `request_id`는 새 UUID를 만들고, 응답 유실로 같은 동작을 재시도할 때 유지한다. 같은 키로 내용을 바꾸면 400이다. 정상 실패로 종료된 제재 요청을 새로 시도할 때는 새 키를 사용한다.

| action           | 추가 필드                                                          | 결과                                                                                        |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| list_reports     | before_id?                                                         | 콘텐츠별 신고 수·사유별/상태별 수·최초/최근 시각. 최신 신고 ID 역순 50그룹                  |
| report_detail    | report_id, before_report_id?                                       | 원문·soft delete 상태·댓글 신고 Snapshot·작성자 UUID·제재/감사 이력·같은 콘텐츠의 신고 50건 |
| report_status    | request_id, report_id, status, reason_category, reason             | received → reviewing → resolved/rejected. 같은 상태 재요청은 동일 키일 때만 성공            |
| hide / restore   | request_id, report_id, reason_category, reason                     | 운영자 숨김·복구. 작성자 삭제는 복구하지 않음                                               |
| sanction         | request_id, user_id, sanction, reason_category, reason, report_id? | warning / community_restricted / suspended / release                                        |
| sanction_request | request_id                                                         | 본인이 시작한 제재 요청의 pending/applied/failed와 action_id 조회                           |

`reason_category`: abuse, spam, inappropriate, other. `reason`: 공백만으로 구성되지 않은 1~1000 사용자 인식 문자. 사용자 안내에는 유형만 표시하고 상세 사유는 공개하지 않는다. 신고 수에 따른 자동 숨김·삭제·제재·단계 상승은 없다.

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
- `AccountAccessNotice`는 경고/기간 제한을 DIGGLE 최초 진입에 안내한다. 확인 저장 실패 시 모달을 유지한다. 새 제재는 이전 건의 확인 여부와 별개다. 새 조치로 대체되거나 해제된 이전 제재는 다시 안내하지 않는다.
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
   - #115 최초 Retool 계정은 `20261021173103_register_retool_operator.sql` 데이터 마이그레이션으로 등록한다. 지정한 UID의 이메일 확인이 완료된 Auth 계정만 `operator`로 추가하며, 계정이 없는 로컬/CI에서는 건너뛴다. 기존 운영자의 권한·비활성화 상태는 바꾸지 않는다. PR 승인·병합 후 자동 배포가 끝나야 Retool에서 관리자 API를 사용할 수 있다.
   - #121은 승인 리뷰 없이 병합되어 배포의 승인 검사에서 중단됐다. DB 등록 SQL을 직접 실행하지 않고 승인된 후속 PR로 미적용 마이그레이션을 배포한다. 후속 PR의 `deploy` 성공 후 Retool 관리자 로그인과 `list_reports` 성공을 확인한다. 신고가 없어 빈 배열이 반환되어도 정상이며, 403이면 Auth 이메일 확인과 해당 UID의 운영자 등록·비활성화 상태를 확인한다.
4. 승인된 PR을 develop에 병합하면 기존 검증과 DB 배포 후 두 Edge Function을 배포한다. 함수 배포 실패는 Actions 실패로 남기며 설정을 고쳐 같은 실행을 다시 실행한다. API 설정·관리자 계정·audience 값은 코드에서 임의 생성하지 않는다.

## 로컬 검증

- `npm run test:community`, `npm run test:moderation`, 타입·린트 검사
- `supabase db reset --local --no-seed`, `supabase test db --local`, DB lint·Advisors, public 타입 재생성
- #115 등록 데이터 검증: 전체 마이그레이션을 적용한 **별도 로컬 임시 DB**에서 `pg_prove --dbname "$LOCAL_TEST_DB_URL" scripts/check_retool_operator.sql`을 실행한다. 실제 등록 마이그레이션을 읽어 계정 누락·이메일 미확인·정상 등록·타 계정 제외·재실행을 검사하고 롤백한다. 이 검사는 공유/운영 DB에서 실행하지 않는다.
- `deno test --allow-net --config supabase/functions/deno.json supabase/functions/admin-moderation/handler_test.ts supabase/functions/account-restriction/identity_test.ts`
- `scripts/check_moderation_auth.cjs`: **project_id diggin-114, API 55481 / DB 55482** 전용 임시 환경에서만 실행. `MODERATION_TEST_WORKDIR`, `DENO_BIN`을 지정한다. Deno 테스트 서버가 기본 포트 8000을 쓰므로 다른 서비스가 없는지 확인한다. 실제 Auth API·동시 요청·강제 롤백·ban·갱신 차단·미만료 JWT·해제를 검증한다. 테스트 계정과 변경 불가 감사 기록을 생성하며 검증 후 해당 임시 DB만 reset/stop으로 제거한다.

공식 참고: [Supabase Auth 세션](https://supabase.com/docs/guides/auth/sessions), [Admin 사용자 변경](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [토큰 권한](https://supabase.com/docs/guides/platform/personal-access-tokens), [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect), [Kakao OIDC](https://developers.kakao.com/docs/ko/kakaologin/utilize), [Apple 검증](https://developer.apple.com/documentation/signinwithapple/verifying-a-user).
