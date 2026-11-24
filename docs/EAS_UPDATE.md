# EAS Update

모바일 앱의 JavaScript·TypeScript 로직, 화면·스타일과 이미지 등 에셋을 새 스토어 빌드 없이 배포하는 설정입니다. 관리자 웹 `admin/`과는 별개입니다.

## 설정과 적용 범위

- Expo SDK 57에 맞는 `expo-updates`를 설치했습니다.
- 업데이트 서버는 기존 Diggin EAS 프로젝트 `a58be392-d642-442d-a55a-bdfaedbcb9eb`입니다.
- `runtimeVersion.policy`는 `fingerprint`입니다. Expo가 네이티브 의존성·설정·플러그인 등으로 런타임을 계산하고, 같은 플랫폼·런타임·채널의 업데이트만 받습니다. 네이티브 호환성이 달라지면 새 빌드가 필요합니다.
- 실행 시 업데이트를 확인하고 백그라운드로 내려받아 다음 실행에 적용하는 기본 동작을 사용합니다. 사용 중인 앱을 강제로 재시작하거나 별도 업데이트 모달을 띄우지 않습니다. 오프라인에서는 설치된 번들을 실행합니다.
- 네이티브 라이브러리·Expo SDK·권한·앱 식별자·네이티브 설정·config plugin 변경은 새 빌드 대상입니다. 새 JavaScript가 기존 네이티브 런타임에서 실행 가능한지 먼저 확인합니다.
- iOS 공유 확장은 별도 `index.share.js` 번들을 앱 안에 포함하고 `expo-updates`를 링크하지 않습니다. 공유 확장의 화면·로직 변경도 새 iOS 빌드로 배포합니다. OTA 검증은 본 앱과 공유 확장을 구분해서 진행합니다.

## 채널과 환경

| 빌드 프로필  | 업데이트 채널 | EAS 환경     | 용도                      |
| ------------ | ------------- | ------------ | ------------------------- |
| `preview`    | `preview`     | `preview`    | 내부 배포로 OTA 사전 확인 |
| `qa`         | `preview`     | `preview`    | 개발 DB로 TestFlight QA   |
| `production` | `production`  | `production` | 스토어 앱의 운영 OTA      |

환경과 채널은 별개입니다. `channel`은 받을 업데이트를, `environment`는 번들에 들어갈 환경변수를 정합니다. npm 배포 명령에는 둘 다 지정했습니다. 빌드 프로필의 `env`나 로컬 `.env`에만 의존하지 않습니다.

`qa`는 스토어 서명으로 빌드하되 `preview` 환경·채널을 사용합니다. 기존 `preview`의 iOS 내부 배포와 달리 TestFlight에 올릴 수 있습니다. 개발 관리자 웹과 앱을 함께 검증하는 순서는 [개발 QA와 운영 배포](QA_RELEASE.md)를 따릅니다.

각 환경의 값은 EAS 대시보드의 **Environment variables → preview / production**에서 관리합니다. 개발 DB를 사용할 경우 preview에 개발용 연결 값을 등록합니다.

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY`
- `EXPO_PUBLIC_AMPLITUDE_API_KEY` — 분석 검증 시 해당 환경의 프로젝트 키 사용

네이티브 설정에 영향을 주는 Google·Kakao 키와 Firebase 파일은 빌드와 OTA에서 같아야 합니다. Android 빌드에 사용한 `GOOGLE_SERVICES_JSON` 파일도 같은 내용으로 준비해야 합니다. 로컬 `google-services.json`을 사용했다면 OTA 실행 체크아웃에도 동일한 파일이 필요합니다. 파일이나 키의 내용은 Git에 추가하지 않습니다.

`fingerprint`는 앱 버전·빌드 번호 변경도 감지합니다. `autoIncrement`로 빌드한 뒤에는 성공한 빌드의 `version`·`ios.buildNumber`·`android.versionCode`를 저장소에 반영하고, OTA도 그 기록을 기준으로 실행합니다. 번호가 오래된 체크아웃으로 게시하면 대상 빌드와 런타임이 달라질 수 있습니다.

플랫폼을 순서대로 빌드하면 다른 플랫폼의 번호 변경도 이미 만든 빌드의 fingerprint와 차이를 만들 수 있습니다. 따라서 단순히 최신 develop의 번호를 사용하지 말고, 대상 플랫폼의 **빌드 당시 app.json 전체와 커밋**을 기준으로 준비합니다. 성공한 배포 파일 옆에 보관한 `app.json`·`build-info.json`을 대조하고, 게시 전에 계산한 runtime이 대상 빌드의 runtime과 일치하는지 확인합니다. 두 플랫폼의 기준 설정이 다르면 OTA도 플랫폼별로 준비해 게시합니다.

Secret 변수는 로컬 OTA 명령에서 읽을 수 없습니다. 필요한 네이티브 설정이 Secret으로만 제공되거나 빌드와 다르면 fingerprint가 달라져 OTA가 적용되지 않을 수 있습니다. 이 경우 빌드와 OTA가 같은 설정을 해석하도록 준비하고 실제 런타임 일치를 확인합니다. `EXPO_PUBLIC_*`에는 서버 비밀키를 넣지 않습니다.

## 최초 도입

현재 설치된 기존 스토어 앱에는 이 네이티브 설정이 없으므로 OTA를 받을 수 없습니다. 이 변경을 병합한 후 iOS·Android를 각각 한 번 새로 빌드해 배포해야 합니다. 현재 저장소의 버전·빌드 번호는 이전 기록이므로, 빌드 전 EAS의 최신 성공 빌드와 스토어 버전을 확인해 번호를 맞춥니다.

```powershell
# 환경변수를 준비하고, 검증할 정확한 커밋에서 실행
npx eas-cli@27.4.1 build --profile preview --platform android
# iOS 실기기 내부 배포는 기기 등록·프로비저닝 준비 필요
npx eas-cli@27.4.1 build --profile preview --platform ios

# 운영 릴리스는 승인·병합된 main의 정확한 커밋에서 수행
npx eas-cli@27.4.1 build --profile production --platform android
npx eas-cli@27.4.1 build --profile production --platform ios
```

빌드·스토어 업로드와 OTA 게시는 별도 작업입니다. 이 설정 PR은 빌드를 시작하거나 업데이트를 게시하지 않습니다. EAS Build는 빌드 프로필의 채널을 설정합니다. 최초 빌드 후 대시보드에서 실제 채널·브랜치 연결과 런타임을 확인합니다.

## 이후 JavaScript·에셋 수정 배포

배포 명령은 검증한 EAS CLI `27.4.1`로 고정했습니다. 운영 OTA는 `.env`·`.env.*`가 없는 별도 체크아웃과 앱 환경변수를 직접 설정하지 않은 새 터미널에서 실행합니다. 기존 개발 체크아웃의 파일은 삭제하지 않습니다.

`--environment production`은 로컬 `.env` 자동 로딩을 차단하지만, 터미널에 이미 설정된 환경변수를 지우지는 않습니다. EAS에 없는 앱 설정값이 상속되지 않도록 배포 전 터미널 환경도 확인합니다.

1. 배포할 커밋을 확정하고 변경 사항과 환경변수를 확인합니다. 운영은 승인·병합된 `main`, 검증은 해당 preview 커밋을 사용하며 작업 트리는 깨끗하게 유지합니다.
2. 같은 네이티브 설정으로 preview에서 먼저 검증합니다. EAS 대시보드의 런타임이 대상 빌드와 일치하는지 확인합니다.
3. 운영 배포 시 플랫폼·환경·채널과 대상 런타임을 다시 확인하고 실행합니다.

```powershell
# 처음 명령을 실행할 때 EAS CLI 설치·로그인이 필요할 수 있습니다.
npm run update:preview -- --platform android --message "로그인 화면 문구 수정"

# iOS·Android 모두 변경된 경우 --platform all
npm run update:production -- --platform all --message "로그인 화면 문구 수정"
```

대상 빌드와 runtime fingerprint가 다르거나 네이티브 기능을 변경했다면 OTA 대신 새 빌드를 배포합니다. iOS·Android의 runtime fingerprint는 서로 다를 수 있습니다. EAS 요금제의 업데이트 사용자 수·대역폭 한도도 대시보드에서 확인합니다.

## 기기 검증과 복구

- Metro 개발 서버·Expo Go 대신 해당 채널의 release 빌드를 설치합니다.
- 앱을 완전히 종료하고 다시 실행해 다운로드한 뒤, 다운로드가 끝나면 다시 종료·실행해 수정이 반영되는지 확인합니다. 네트워크와 번들 크기에 따라 다운로드 시간이 달라질 수 있습니다.
- 오프라인 실행, 로그인·핵심 저장 흐름, 본 앱과 iOS 공유 확장의 동작을 구분해서 확인합니다.
- 배포 기록에 소스 커밋·플랫폼·환경·채널·runtime fingerprint·EAS update group ID/URL과 검증 결과를 남깁니다.
- 문제가 생기면 해당 채널·런타임의 최신 update group을 골라 이전 업데이트로 되돌립니다. 이전 OTA가 없으면 embedded update로 복구합니다. 복구 명령도 실제 배포 동작이므로 대상 그룹을 확인한 뒤 실행합니다.

```powershell
npx eas-cli@27.4.1 update:rollback <문제가_생긴_최신_update_group_ID> --message "이전 정상 버전으로 복구"
```

복구도 호환되는 빌드가 다음 업데이트를 확인할 때 적용됩니다. 런타임을 임의로 고정하거나 바꿔 호환성 검사를 우회하지 않습니다.

## 공식 문서

- [EAS Update 시작](https://docs.expo.dev/eas-update/getting-started/)
- [런타임 호환성](https://docs.expo.dev/eas-update/runtime-versions/)
- [SDK 57 expo-updates 기본 동작](https://docs.expo.dev/versions/v57.0.0/sdk/updates/)
- [빌드·업데이트 환경변수](https://docs.expo.dev/eas/environment-variables/usage/)
