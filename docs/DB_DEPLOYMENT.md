# 공유 개발 DB 자동 배포

승인된 PR을 develop에 병합하면 GitHub Actions가 DB 변경을 검증한 뒤 공유 개발 Supabase DB에 적용한다. 앱 코드만 GitHub에 올라가고 DB 적용은 빠지는 상황을 방지하기 위한 설정이다.

## 동작 순서

1. develop 대상 PR의 승인을 받고 병합한다.
2. develop의 push 이벤트에서 `supabase/**` 또는 배포 워크플로가 변경됐으면 `Deploy shared development database`가 실행된다. 닫기만 하고 병합하지 않은 PR, 다른 브랜치의 push는 실행하지 않는다.
3. 실행 커밋과 연결된 PR이 이 저장소의 develop에 병합됐고, PR의 병합 커밋이 실행 커밋과 일치하며, 검토 상태가 `APPROVED`인지 확인한다. 직접 push는 이 검사에서 차단한다. 현재 develop 보호 규칙은 승인 1개를 요구하며 새 커밋이 올라오면 기존 승인을 취소한다. 관리자 예외로 승인 없이 병합해도 이 워크플로는 중단된다.
4. 해당 push의 정확한 커밋(`github.sha`)을 체크아웃하고 ID를 기록한다. 실행 대기 중 develop에 새 커밋이 추가돼도 검사한 커밋만 검증·배포한다.
5. GitHub의 임시 로컬 DB에서 마이그레이션 전체 재적용, pgTAP, DB lint, Advisors 검사를 실행한다. 로컬 검증에는 공유 DB 접속 정보를 사용하지 않는다.
6. 검증한 커밋을 다시 체크아웃해 공유 DB의 대기 중 마이그레이션을 확인하고 적용한다. 적용 후 이력을 출력하고 Actions 요약에 커밋 ID를 기록한다.

Supabase CLI는 로컬에서 검증한 `2.120.0`으로 고정하며 외부 Actions도 커밋 SHA로 고정한다. 검증과 배포는 전체 워크플로 단위로 직렬화한다. 실행 중 배포는 취소하지 않으며, GitHub가 대기 중 실행을 최신 요청으로 통합해도 해당 실행 커밋에 포함된 미적용 마이그레이션을 함께 반영한다.

## 처음 한 번 설정할 것

저장소 Settings → Environments → `shared-development`를 사용한다. 배포 허용 브랜치는 develop만 지정하고 별도 Environment 승인자는 두지 않는다. PR 승인을 받은 뒤 다시 승인을 요청하지 않도록 하기 위함이다.

배포 트리거는 develop의 push 이벤트로 유지한다. `pull_request` 이벤트는 Environment 보호 규칙에서 `refs/pull/<번호>/merge`로 평가되므로 develop만 허용하는 설정과 충돌한다. 체크아웃 브랜치를 develop으로 지정하는 것만으로는 이 실행 ref가 바뀌지 않는다.

Environment에 아래 값을 등록한다. 접속 토큰과 비밀번호는 코드·이슈·PR·채팅에 붙여 넣지 않는다.

| 구분     | 이름                    | 값                                                                       |
| -------- | ----------------------- | ------------------------------------------------------------------------ |
| Variable | `SUPABASE_PROJECT_ID`   | **공유 개발 DB** 프로젝트의 Project Ref. Dashboard 프로젝트 URL에서 확인 |
| Secret   | `SUPABASE_ACCESS_TOKEN` | 해당 프로젝트로 범위를 제한한 Supabase 개인 액세스 토큰                  |
| Secret   | `SUPABASE_DB_PASSWORD`  | 해당 프로젝트의 DB 비밀번호. 앱의 publishable/anon 키가 아님             |

`supabase link`용 토큰은 Supabase 공식 안내에 따라 해당 프로젝트의 **Project Settings, API Keys, API Key Secrets를 Read**로 지정한다. DB 연결 권한은 별도의 DB 비밀번호가 결정한다. 운영 프로젝트의 값을 등록하지 않는다.

등록 화면: https://github.com/Digginn/Diggin-app/settings/environments

이 값이 비어 있으면 워크플로는 누락된 항목 이름을 표시하고 DB 적용 전에 중단한다. 실제 비밀값은 로그에 출력하지 않는다. OAuth 로그인 설정·프로젝트 설정·Edge Functions·기기별 로컬 DB는 이 워크플로의 배포 대상이 아니다.

## 최초 배포 전 확인

이미 사용하는 공유 DB가 있으므로 프로젝트 담당자가 그 DB의 마이그레이션 이력이 Git의 `supabase/migrations/`와 일치하는지 확인한 뒤 접속 정보를 등록한다. 과거에 SQL Editor로 직접 만든 테이블이 있으면 Git 이력과 맞추는 검토가 먼저 필요하다.

워크플로는 현재 PR의 SQL 한 개만 적용하는 것이 아니라 **검증된 커밋에 포함된 미적용 마이그레이션 전체**를 적용한다. 배포 설정 PR 자체가 처음 병합될 때도 적용이 실행될 수 있다.

파일 이름 충돌·이력 불일치를 자동 `migration repair`나 `--include-all`로 넘기지 않는다. 이미 적용된 마이그레이션을 고치거나 지우지 않고 `docs/DB_RULES.md`에 따라 원인을 확인한다. 로컬 CSV 테스트 데이터는 공유 DB로 복사하지 않는다.

## 실패했을 때

1. 저장소 Actions → 해당 실행 → 실패한 단계를 확인한다. 설정 값이 없으면 Environment에 등록한다.
2. 검증 실패는 코드를 수정해 새 PR을 승인·병합한다. 접속 정보 문제는 설정을 고친 뒤 해당 실행을 다시 실행한다.
3. 마이그레이션 적용 중 실패했다면 원격 이력과 오류를 확인한다. 성공한 이전 마이그레이션은 적용돼 있을 수 있으며, 전체 배포가 한 트랜잭션으로 롤백된다고 가정하지 않는다.
4. GitHub Actions의 `Re-run all jobs`로 다시 실행하면 해당 실행의 커밋을 다시 검증하고, 원격에 아직 적용되지 않은 마이그레이션만 처리한다. 이미 적용된 변경을 되돌리지는 않는다. 이전 커밋의 실행을 최신 배포 후 다시 실행하면 마이그레이션 이력 불일치로 중단될 수 있으므로 최신 실행을 사용한다.
5. 이전 `pull_request` 방식으로 실패한 실행은 재실행해도 변경된 트리거가 적용되지 않는다. 수정된 워크플로를 승인된 PR로 develop에 병합해 새 push 실행을 생성한다.

수동 원격 배포가 필요한 예외는 담당자와 협의한다. 공유 DB를 초기화하는 `db reset --linked` 또는 원격 URL 대상 reset은 사용하지 않는다.

## 참고

- [Supabase: Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)
- [GitHub: push 이벤트](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push)
- [GitHub: PR 이벤트의 Environment 보호 규칙 변경](https://github.blog/changelog/2025-11-07-actions-pull_request_target-and-environment-branch-protections-changes/)
