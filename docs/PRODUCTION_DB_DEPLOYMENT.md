# 운영 DB 승인 배포

개발 배포는 `develop → shared-development → Diggin-dev`, 운영 배포는 `main → production → Diggin-pro`로 분리한다. 운영 DB와 서버 함수의 자동 배포만 다루며 앱 바이너리 업로드·스토어 공개는 별도다.

## 배포 순서

1. 기능 PR을 develop에 승인·병합하고 기존 개발 배포와 테스트를 확인한다.
2. develop에서 main으로 PR을 만들고 팀원 승인을 받아 병합한다. main 보호 규칙은 승인 1개를 요구하고 새 커밋이 추가되면 기존 승인을 해제한다.
3. `Deploy production database`는 해당 main push의 정확한 병합 커밋과 PR 승인 상태를 확인한다. 직접 push, 미승인 PR, 다른 브랜치의 병합 커밋은 배포하지 않는다. 개발 배포의 특정 PR 승인 예외는 운영에 적용하지 않는다.
4. 운영 비밀값 없이 임시 DB의 전체 마이그레이션·pgTAP·lint·Advisors·CSV DB 테스트·기존 순서 복구 테스트와 Edge Function 검사를 수행한다. 개발·운영 모두 `.github/actions/validate-database`와 `validate-functions`를 사용한다.
5. 검증 성공 후 `production` 환경 승인 단계에서 `Sonseongoh`·`jizerozz` 중 1명이 GitHub Actions의 **Review deployments**로 운영 배포를 승인한다. 이 승인은 PR 승인과 별개이며 워크플로를 실행한 사람도 본인 배포를 승인할 수 있다.
6. 승인 후에만 운영 비밀값을 사용한다. IPv4 Session pooler(5432, TLS)로 이력·dry-run을 확인하고, 미적용 마이그레이션만 적용한 뒤 동일 커밋의 서버 함수 7개를 배포한다.

워크플로는 `.github/workflows/deploy-production-db.yml`이다. DB·배포 스크립트·공통 검증 액션·워크플로가 바뀐 main PR/push에서 실행한다. 함수는 DB 적용 성공 후 배포하며 `admin-moderation`, `account-restriction`, `account-withdrawal`, `notification-push`, `csv-import`, `apple-token`, `underage-cleanup`이 대상이다.

실행 중인 운영 배포는 취소하지 않는다. 각 배포는 검증된 커밋을 사용하며 운영 배포끼리는 직렬화한다. 함수 배포 실패가 이미 적용된 DB 변경을 자동으로 되돌리지는 않는다.

## GitHub 설정

Repository Settings → Environments → `production`:

- Required reviewers: `Sonseongoh`, `jizerozz` (실행자 본인을 포함해 1명 승인)
- Prevent self-review: 비활성화 (본인이 실행한 배포도 승인 가능)
- 관리자 보호 규칙 우회: 허용하지 않음
- Deployment branches and tags: main 브랜치만 허용

main에는 PR 승인 1개, 새 커밋 시 승인 해제, 관리자 포함 보호를 설정한다. 환경 승인자가 지정되지 않은 채 워크플로만 병합하면 의도한 승인 대기가 생기지 않으므로 먼저 환경을 설정한다.

| 구분 | production 환경의 이름 | 설정 |
| --- | --- | --- |
| Variable | `SUPABASE_PROJECT_ID` | Diggin-pro의 `hymfhaowjyzuennxphfz` |
| Variable | `SUPABASE_DB_POOLER_HOST` | 운영 프로젝트 Connect → Session pooler의 호스트 이름만 등록 |
| Secret | `SUPABASE_DB_PASSWORD` | 운영 DB 비밀번호. 앱 publishable 키가 아님 |
| Secret | `SUPABASE_ACCESS_TOKEN` | 운영 프로젝트의 Edge Functions 배포 권한을 가진 토큰. 가능하면 프로젝트·필요 권한으로 제한 |

운영 프로젝트의 실제 pooler 설정에서 호스트를 확인하며 지역 이름으로 추측하지 않는다. 프로젝트 ref는 워크플로에서도 Diggin-pro로 검사해 개발 프로젝트를 실수로 지정하면 중단한다. DB URL 비밀번호는 URL 인코딩하고 완성된 URL은 로그에서 마스킹한다.

Secret은 GitHub 환경 화면에서 직접 등록한다. 로컬 CLI 로그인 토큰을 자동 복사하거나 채팅·Git·PR에 비밀번호 및 토큰을 기록하지 않는다. 누락된 비밀값이 있으면 실제 DB 적용 전에 중단한다. 운영 함수의 런타임 Secrets, Auth 제공자 설정, Storage 파일, Vault 설정 및 외부 서비스 설정은 자동 복사하지 않는다.

## 최초 배포 점검 기록

2026-11-07 기준 읽기 전용으로 두 프로젝트의 `supabase_migrations.schema_migrations`를 조회했다.

| 대상 | 적용 이력 | 저장소와의 차이 |
| --- | --- | --- |
| Diggin-dev | 40개 | 누락 없음 |
| Diggin-pro | 39개 | `20261106104519_post_blank_line_limit.sql` 1개 미적용 |

운영에만 존재하는 알 수 없는 버전은 없었다. 이 점검은 마이그레이션 이력 대조이며 운영 스키마 전체의 diff나 Session pooler 실접속·dry-run 성공을 뜻하지 않는다. 비밀번호 등록 후 최초 main 배포의 실제 dry-run 결과를 확인해야 한다. 본 설정 작업에서는 운영 DB 변경과 운영 서버 함수 배포를 실행하지 않는다.

운영 이력이 비었거나 저장소와 충돌하면 기존 배포 가드가 중단한다. 자동 repair·reset·seed·무제한 `--include-all`로 넘기지 않고 별도 검토한다. 저장소에 포함된 미적용 변경 전체가 배포 대상이며 해당 PR의 SQL만 적용하는 방식은 아니다.

## 로컬 앱 환경과의 구분

`.env.development.local`은 Expo 개발 실행에 사용할 공개 환경변수이며 Git에서 제외한다. 현재 해당 파일은 Diggin-dev를 가리킨다. 소셜 로그인 등 공통 환경변수는 기존 설정에서 가져온다.

이 파일을 추가해도 GitHub 배포 대상·운영 Secrets·EAS production 환경이 자동으로 바뀌지 않는다. 앱 운영 빌드는 기존 별도 worktree와 EAS `production` 환경을 사용한다. 이 작업에서 `.env.development.local`이나 EAS 환경변수는 변경하지 않는다.

## 실패 대응

검증 실패는 코드를 고친 PR을 검토·병합한 뒤 재시도한다. 접속 정보만 잘못됐으면 `production` 환경 설정을 고치고 해당 main 실행을 재실행한다. 이력은 dry-run 전후로 다시 검사하며 중간에 바뀌면 적용하지 않는다. 이전 커밋을 재실행해 현재 운영 DB를 되돌리거나 운영 DB를 초기화하지 않는다.

## 공식 참고

- [GitHub 환경 승인 및 브랜치 제한](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [Supabase 환경별 배포](https://supabase.com/docs/guides/deployment/managing-environments)
- [Supabase pooler 설정 조회](https://supabase.com/docs/reference/api/v1-get-pooler-config)
