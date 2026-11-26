# 개발 QA와 운영 배포

개발 DB에서 관리자 웹과 앱을 함께 검증하고, QA가 끝난 커밋을 main에 병합해 운영에 배포합니다. TestFlight에 올리기 위해 main을 먼저 병합하지 않습니다.

## 환경 연결

| 대상                    | 개발·QA                   | 운영              |
| ----------------------- | ------------------------- | ----------------- |
| 기준 코드               | develop                   | 승인·병합된 main  |
| Supabase                | Diggin-dev                | Diggin-pro        |
| 관리자 웹               | Vercel Preview            | Vercel Production |
| 관리자 환경 표시        | development               | production        |
| iOS EAS 빌드 프로필     | qa                        | production        |
| Android EAS 빌드 프로필 | qa (Play 내부 테스트 AAB) | production        |
| EAS 환경·OTA 채널       | preview                   | production        |

관리자 웹은 같은 Vercel 프로젝트 `diggin-admin`을 사용합니다. Production Branch는 main으로 유지합니다. Preview에는 개발 프로젝트의 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_ADMIN_ENVIRONMENT=development`를 등록합니다. Production 변수는 운영 프로젝트 값으로 유지합니다. 설정을 바꾼 뒤 새로 배포한 Preview 주소를 공유합니다.

- [개발 관리자 웹](https://diggin-admin-git-develop-sons-projects-56b4f647.vercel.app/#/login)
- [운영 관리자 웹](https://diggin-admin.vercel.app/#/login)

개발·PR Preview 주소도 Vercel 추가 로그인 없이 기존 관리자 로그인으로 접속합니다. 관리자 인증과 서버 권한 검사는 유지합니다.

Vercel 변수는 관리자 웹 빌드용이고 EAS 변수는 모바일 앱 빌드용입니다. 서로 자동 복사되지 않습니다. 실제 키를 Git이나 문서에 적지 않습니다.

## 1. 개발 환경에서 QA

1. 기능 PR을 develop에 병합하고, 해당 커밋의 `Deploy shared development database`가 성공했는지 확인합니다. DB와 Edge Function이 준비된 뒤 QA합니다.
2. 같은 커밋의 관리자 웹 Preview를 열어 상단 환경 표시가 development이고 프로젝트가 Diggin-dev인지 확인합니다. 개발 DB에 등록한 관리자 계정으로 로그인합니다.
3. EAS preview의 URL·공개 키가 같은 개발 프로젝트를 가리키는지 확인합니다. 소셜 로그인 키와 필요한 네이티브 설정도 준비합니다. 분석 이벤트를 검증하려면 별도 개발 Amplitude 키를 사용합니다.
4. EAS와 App Store Connect의 기존 빌드 번호를 확인해 중복되지 않게 맞춥니다. 현재 저장소의 번호가 최신이라고 가정하지 않습니다. 깨끗한 체크아웃에서 다음 명령을 실행합니다.

```powershell
npx eas-cli@27.4.1 build --platform ios --profile qa
# 성공한 QA 빌드의 ID를 명시합니다.
npx eas-cli@27.4.1 submit --platform ios --profile qa --id <QA_BUILD_ID>
```

5. App Store Connect에서 해당 빌드를 TestFlight 테스터 그룹에 배정합니다. 공지 작성 → DIGGLE 상단·알림함 노출, 신고·제재, 로그인, 댓글·답글·좋아요를 개발 데이터로 검증합니다. 수정이 필요하면 develop에 반영하고 다시 확인합니다.

QA 빌드는 기존 iOS 앱과 같은 번들 ID를 사용합니다. 스토어 앱과 별도로 동시에 설치되지는 않습니다. TestFlight의 테스트 내용에는 개발 DB용 빌드임을 표시합니다.

### Android는 Play 내부 테스트

팀 QA는 `qa` 프로필의 AAB를 Google Play 내부 테스트에 올립니다. `qa`도 기존 Android 패키지와 업로드 서명을 사용하고 개발 DB·preview OTA 채널에 연결합니다. EAS와 Play Console에서 마지막 versionCode를 확인하고 중복되지 않게 준비합니다.

```powershell
npx eas-cli@27.4.1 build --platform android --profile qa
```

빌드한 AAB를 Play Console의 **테스트 및 출시 → 테스트 → 내부 테스트 → 새 버전 만들기**에 추가합니다. 테스터 목록과 참여 링크를 확인하고 내부 테스트에 게시한 뒤 해당 Google 계정으로 Play 스토어에서 설치합니다. EAS 제출 자격증명이 준비된 경우 `eas submit --platform android --profile qa --id <QA_BUILD_ID>`로 초안을 올릴 수도 있습니다. 현재 제출 프로필은 internal 트랙·draft 상태이므로 실제 내부 테스트 게시는 Console에서 확인합니다.

바로 설치하는 개발 확인은 기존 `preview` 프로필의 APK를 사용할 수 있습니다. QA용 AAB를 프로덕션 트랙으로 승격하지 않고, QA 후 main에서 운영 DB용 AAB를 새로 빌드합니다.

## 2. QA 완료 후 운영 배포

1. QA한 커밋과 테스트 결과를 기록하고 develop → main PR을 리뷰·병합합니다. QA 이후 추가 변경이 있다면 그 변경도 검증합니다.
2. 운영 DB 배포 워크플로의 검증·별도 승인을 완료하고 DB·Edge Function 배포 성공을 확인합니다. [운영 DB 배포 절차](PRODUCTION_DB_DEPLOYMENT.md)를 따릅니다.
3. main의 정확한 커밋에서 production 프로필로 빌드합니다. 운영 EAS 환경·채널과 운영 DB 연결을 확인합니다.

```powershell
npx eas-cli@27.4.1 build --platform ios --profile production
npx eas-cli@27.4.1 submit --platform ios --profile production --id <PRODUCTION_BUILD_ID>
```

4. 운영 빌드로 최종 확인한 뒤 App Store 심사에 제출합니다. 개발 DB가 들어 있는 QA 빌드를 App Store 출시 빌드로 선택하지 않습니다.

OTA도 QA는 preview, 운영은 production으로 분리합니다. 빌드 번호와 fingerprint가 일치하는 체크아웃에서 게시하며 [EAS Update 안내](EAS_UPDATE.md)를 따릅니다.

## 공식 문서

- [EAS 빌드 프로필](https://docs.expo.dev/build/eas-json/)
- [Vercel 배포 환경](https://vercel.com/docs/deployments/environments)
- [Google Play 내부 테스트](https://support.google.com/googleplay/android-developer/answer/9845334?hl=ko)
