# 공유 개발 DB 자동 배포

승인된 PR을 develop에 병합하면 GitHub Actions가 DB 변경을 검증한 뒤 공유 개발 Supabase DB에 적용한다. 앱 코드만 GitHub에 올라가고 DB 적용은 빠지는 상황을 방지하기 위한 설정이다.

## 동작 순서

1. develop 대상 PR의 승인을 받고 병합한다.
2. develop 대상 PR과 develop의 push 이벤트에서 `supabase/**`, 배포 Python 스크립트 또는 배포 워크플로가 변경됐으면 `Deploy shared development database`가 실행된다. PR에서는 공유 DB 접속 정보 없이 임시 DB 검증만 수행하고, 실제 배포는 승인·병합 후 develop의 push에서만 실행한다.
3. 실행 커밋과 연결된 PR이 이 저장소의 develop에 병합됐고, PR의 병합 커밋이 실행 커밋과 일치하며, 검토 상태가 `APPROVED`인지 확인한다. 직접 push는 이 검사에서 차단한다. 현재 develop 보호 규칙은 승인 1개를 요구하며 새 커밋이 올라오면 기존 승인을 취소한다. 관리자 예외로 승인 없이 병합해도 이 워크플로는 중단된다.
4. 해당 push의 정확한 커밋(`github.sha`)을 체크아웃하고 ID를 기록한다. 실행 대기 중 develop에 새 커밋이 추가돼도 검사한 커밋만 검증·배포한다.
5. GitHub의 임시 로컬 DB에서 마이그레이션 전체 재적용, pgTAP, DB lint, Advisors 검사를 실행한다. 별도 임시 DB에서는 CSV 두 파일을 제외하고 폴더 마이그레이션까지 먼저 적용한 뒤, 원본 CSV 파일을 복원해 실제 배포 스크립트로 역순 적용하고 같은 검사를 반복한다. 로컬 검증에는 공유 DB 접속 정보를 사용하지 않는다.
6. 검증한 커밋을 다시 체크아웃해 IPv4 Session pooler로 원격 이력을 조회하고 `db push --dry-run`으로 대기 중 마이그레이션을 확인한다. 두 명령이 성공해야 실제 적용한다. 적용 후 이력을 출력하고 Actions 요약에 커밋 ID를 기록한다.

Supabase CLI는 로컬에서 검증한 `2.120.0`으로 고정하며 외부 Actions도 커밋 SHA로 고정한다. 검증과 배포는 전체 워크플로 단위로 직렬화한다. 실행 중 배포는 취소하지 않으며, GitHub가 대기 중 실행을 최신 요청으로 통합해도 해당 실행 커밋에 포함된 미적용 마이그레이션을 함께 반영한다.

## 처음 한 번 설정할 것

저장소 Settings → Environments → `shared-development`를 사용한다. 배포 허용 브랜치는 develop만 지정하고 별도 Environment 승인자는 두지 않는다. PR 승인을 받은 뒤 다시 승인을 요청하지 않도록 하기 위함이다.

배포 트리거는 develop의 push 이벤트로 유지한다. `pull_request` 이벤트는 Environment 보호 규칙에서 `refs/pull/<번호>/merge`로 평가되므로 develop만 허용하는 설정과 충돌한다. 체크아웃 브랜치를 develop으로 지정하는 것만으로는 이 실행 ref가 바뀌지 않는다.

Environment에 아래 값을 등록한다. 접속 토큰과 비밀번호는 코드·이슈·PR·채팅에 붙여 넣지 않는다.

| 구분     | 이름                      | 값                                                                                      |
| -------- | ------------------------- | --------------------------------------------------------------------------------------- |
| Variable | `SUPABASE_PROJECT_ID`     | **공유 개발 DB** 프로젝트의 Project Ref. Dashboard 프로젝트 URL에서 확인                |
| Variable | `SUPABASE_DB_POOLER_HOST` | 해당 프로젝트 Connect → Session pooler의 호스트 이름만 입력 (포트·사용자·비밀번호 제외) |
| Secret   | `SUPABASE_ACCESS_TOKEN`   | 대상 프로젝트의 Edge Functions Read-write 권한 토큰. 함수 배포에만 사용                 |
| Secret   | `SUPABASE_DB_PASSWORD`    | 해당 프로젝트의 DB 비밀번호. 앱의 publishable/anon 키가 아님                            |

Session pooler 주소는 해당 프로젝트의 Connect → Session pooler에서 확인한다. 지역 이름으로 주소를 추측하지 않는다. 워크플로가 `postgres.<Project Ref>` 사용자, 5432 포트, TLS(`sslmode=require`)로 DB URL을 구성하고 모든 원격 명령에 `--db-url`로 전달한다. 비밀번호의 특수문자는 URL 인코딩하며 완성된 URL은 로그에서 마스킹한다. DB 배포에는 `supabase link`와 Management API 토큰을 사용하지 않는다. `SUPABASE_ACCESS_TOKEN`은 마이그레이션 이후 관리자·제재 Edge Function 배포에만 사용한다. 운영 프로젝트의 값을 등록하지 않는다.

GitHub Actions의 IPv4 환경에서 IPv6 직접 DB 연결을 시도하면 `IPv6 is not supported on your current network`로 실패할 수 있다. Session pooler는 IPv4를 지원하며, 연결 확인과 dry-run을 거쳐 실제 적용 여부를 검증한다. Transaction pooler(6543)가 아닌 Session pooler(5432)를 사용한다.

등록 화면: https://github.com/Digginn/Diggin-app/settings/environments

이 값이 비어 있으면 워크플로는 누락된 항목 이름을 표시하고 DB 적용 전에 중단한다. 실제 비밀값은 로그에 출력하지 않는다. DB 배포 성공 후 같은 커밋의 `admin-moderation`, `account-restriction` Edge Function을 배포한다. Deno 검사·테스트도 선행한다. OAuth 로그인 설정·프로젝트 설정·기기별 로컬 DB는 배포 대상이 아니다. 운영자 계정 등록과 OIDC audience 설정은 [MODERATION_API.md](MODERATION_API.md)를 따른다. 함수 배포 실패는 Actions 실패로 표시되며 DB 적용을 자동으로 되돌리지는 않는다.

## 최초 배포 전 확인

이미 사용하는 공유 DB가 있으므로 프로젝트 담당자가 그 DB의 마이그레이션 이력이 Git의 `supabase/migrations/`와 일치하는지 확인한 뒤 접속 정보를 등록한다. 과거에 SQL Editor로 직접 만든 테이블이 있으면 Git 이력과 맞추는 검토가 먼저 필요하다.

워크플로는 현재 PR의 SQL 한 개만 적용하는 것이 아니라 **검증된 커밋에 포함된 미적용 마이그레이션 전체**를 적용한다. 배포 설정 PR 자체가 처음 병합될 때도 적용이 실행될 수 있다.

파일 이름 충돌·이력 불일치를 자동 `migration repair`나 `--include-all`로 넘기지 않는다. 이미 적용된 마이그레이션을 고치거나 지우지 않고 `docs/DB_RULES.md`에 따라 원인을 확인한다. 로컬 CSV 테스트 데이터는 공유 DB로 복사하지 않는다.

### PR #80의 CSV 마이그레이션 누락 복구

폴더 PR #86의 `20261018114830_set_product_folders.sql`이 먼저 배포된 뒤, 날짜가 앞선 CSV 파일 두 개가 PR #80으로 병합되어 일반 `db push`가 dry-run에서 중단됐다. 복구 대상은 아래 원본 두 파일뿐이다.

- `20261016124751_csv_import.sql`
- `20261017082235_csv_import_review_fixes.sql`

두 파일은 Import 테이블·RPC와 CSV 원본 폴더 매핑을 추가하며 기존 `set_owned`·`set_product_folders` 함수를 교체하지 않는다. 전체 재적용과 폴더 우선 적용 후 복구를 모두 CI에서 검증한 커밋만 배포한다.

`scripts/deploy_shared_db.py`는 CLI 이력과 체크아웃의 버전을 대조한다. 과거 순서의 미적용 파일이 위 두 파일이며 검토한 SHA-256과 일치하고 폴더 마이그레이션이 이미 적용된 경우에만 dry-run·실제 push 양쪽에 `--include-all`을 붙인다. 줄바꿈 차이는 체크섬에서 제외한다. 한 파일만 적용된 뒤 실패한 경우 남은 파일로 재시도할 수 있으며, 둘 다 적용된 뒤에는 이 예외가 사용되지 않는다.

알 수 없는 과거 누락·중복 버전·원격에만 있는 버전·빈 원격 이력·복구 SQL 변경·dry-run 중 이력 변경은 배포 전에 중단한다. 일반적인 후속 마이그레이션은 기존 방식으로 적용한다. 원격 reset·repair·seed·Vault 변경은 수행하지 않는다.

복구 PR 승인·병합으로 새 push 실행을 생성하고, 완료 후 원격 이력에서 두 CSV 버전이 적용됐는지 확인한다. 예전 실패 실행을 재실행하면 수정 전 워크플로가 사용되므로 복구되지 않는다.

## 실패했을 때

1. 저장소 Actions → 해당 실행 → 실패한 단계를 확인한다. 설정 값이 없으면 Environment에 등록한다.
2. 검증 실패는 코드를 수정해 새 PR을 승인·병합한다. 접속 정보 문제는 설정을 고친 뒤 해당 실행을 다시 실행한다.
3. 마이그레이션 적용 중 실패했다면 원격 이력과 오류를 확인한다. 성공한 이전 마이그레이션은 적용돼 있을 수 있으며, 전체 배포가 한 트랜잭션으로 롤백된다고 가정하지 않는다.
4. GitHub Actions의 `Re-run all jobs`로 다시 실행하면 해당 실행의 커밋을 다시 검증하고, 원격에 아직 적용되지 않은 마이그레이션만 처리한다. 이미 적용된 변경을 되돌리지는 않는다. 이전 커밋의 실행을 최신 배포 후 다시 실행하면 마이그레이션 이력 불일치로 중단될 수 있으므로 최신 실행을 사용한다.
5. 이전 `pull_request` 방식으로 실패한 실행은 재실행해도 변경된 트리거가 적용되지 않는다. 수정된 워크플로를 승인된 PR로 develop에 병합해 새 push 실행을 생성한다.
6. IPv6 오류로 실패한 기존 실행도 이전 연결 방식을 사용한다. `SUPABASE_DB_POOLER_HOST`를 먼저 등록한 뒤 이 수정 PR을 승인·병합해 새 실행을 확인한다. 실제 접속·dry-run 통과 전에는 배포 성공으로 간주하지 않는다.

수동 원격 배포가 필요한 예외는 담당자와 협의한다. 공유 DB를 초기화하는 `db reset --linked` 또는 원격 URL 대상 reset은 사용하지 않는다.

## 참고

- [Supabase: Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)
- [Supabase: Session pooler](https://supabase.com/docs/guides/database/connecting-to-postgres#shared-pooler-session-mode)
- [GitHub: push 이벤트](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push)
- [GitHub: PR 이벤트의 Environment 보호 규칙 변경](https://github.blog/changelog/2025-11-07-actions-pull_request_target-and-environment-branch-protections-changes/)
