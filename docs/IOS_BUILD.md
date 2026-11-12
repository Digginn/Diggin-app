# iOS 빌드

## 최근 빌드

- 버전: `1.0.1 (14)`
- 소스: main `adc598517aa530249ffe9bf68526ab89f76b10a1` ([운영 반영 PR #213](https://github.com/Digginn/Diggin-app/pull/213)). 빌드용 checkout에서 앱 버전을 `1.0.1`로 설정하고, 마지막 성공 번호 `13`에서 `autoIncrement`로 `14`를 생성했다. 성공한 버전과 번호를 이 기록 PR의 `app.json`에 반영한다.
- [EAS 빌드](https://expo.dev/accounts/diggin/projects/Diggin/builds/33ff60db-9be8-44e7-877b-9b70c91a269c): 성공.
- [App Store Connect 업로드](https://expo.dev/accounts/diggin/projects/Diggin/submissions/a05e48e8-2b5a-4d0d-9987-02d2b6b458dc): EAS Submit 진행 중. Apple 처리·TestFlight 상태는 완료 후 확인한다.
- IPA에서 본 앱·공유 확장 버전, App Group·운영 APNs·Apple 로그인 프로필, Google·Kakao URL 스킴, iPhone 전용 설정을 확인했다.
- 본 앱과 공유 확장의 Amplitude 네이티브 모듈, production API 키와 운영 Supabase 주소 포함, 개발 Supabase 주소 미포함을 확인했다. API 키 값은 기록하지 않는다.
- IPA·검증 기록: `Documents/DigginReleases/ios/Diggin-1.0.1-14.ipa` 및 같은 이름의 JSON. SHA-256: `934283667cc0a182a172b8aaf8f34beb0fbef2bed3366f4b1224f75e47f0d1fe`.
- 이 빌드는 업로드용이며 App Store 심사 제출·정식 배포는 별도 단계다.

## 이전 빌드

- 버전: `1.0.0 (13)`
- 소스: develop `2e938087d0afa61c6179c6da505fb543b54d3f31` (main 병합 커밋 `1f213311ec29afb28dee9c1af03436107e7739cf`와 소스 트리 동일)
- [EAS 빌드](https://expo.dev/accounts/diggin/projects/Diggin/builds/6b85b3a2-cc87-49c7-837c-e2ef61038997)
- [App Store Connect 업로드](https://expo.dev/accounts/diggin/projects/Diggin/submissions/dd150455-5180-47f9-acaa-a405b1192a06): EAS Submit 완료. 2026-11-08 13:44 UTC 기준 Apple 빌드 조회는 아직 `NOT_VISIBLE_YET`이며 처리 완료·TestFlight 노출은 별도 확인이 필요하다.
- 본 앱과 공유 확장의 버전·서명, 운영용 APNs 권한, App Group, 소셜 로그인 URL 스킴, 운영 Supabase 주소, iPhone 전용 설정을 IPA에서 확인했다.
- 운영 DB·서버 함수 [배포](https://github.com/Digginn/Diggin-app/actions/runs/42485489809) 성공 후 닉네임 응답과 CSV 이미지 컬럼·RPC 적용을 읽기 전용으로 확인했다.
- IPA·검증 기록: `Documents/DigginReleases/ios/Diggin-1.0.0-13.ipa` 및 같은 이름의 JSON. SHA-256: `ed2b477d6f8ed703a9e722224357774949a8c2d7cf55d021d20230fe57d75497`.
- 빌드 성공과 TestFlight 업로드는 별개다. TestFlight 확인 전에는 App Store Connect 업로드 및 처리가 필요하다.

## 다음 빌드

- develop 변경을 main에 병합한 뒤, 정확한 main 병합 커밋을 별도 빌드용 worktree에서 사용한다.
- `eas submit:status --platform ios --profile production --json --non-interactive`로 정식 출시 버전과 TestFlight 빌드 번호를 먼저 확인한다. 다음 업데이트에 사용할 빌드는 출시 버전보다 높은 앱 버전으로 준비한다.
- `npm ci` 후 `eas build --platform ios --profile production`으로 빌드한다.
- EAS의 production 환경을 사용하고 로컬 DB 주소가 포함된 `.env`는 복사하지 않는다.
- EAS 최근 성공 빌드와 로컬 보관 기록에서 가장 높은 번호를 확인하고 `autoIncrement`로 올린다. 성공한 앱 버전·빌드 번호만 저장소에 반영한다.
- IPA와 빌드 정보·SHA-256을 기존 `Documents/DigginReleases/ios` 보관 위치에 남긴다.

## 출시 버전 확인과 TestFlight 테스트 내용

- 2026-11-12: `1.0 (13)` 정식 출시 상태를 확인하기 전에 시작한 `1.0.0 (14)` [작업](https://expo.dev/accounts/diggin/projects/Diggin/builds/bab3e2ce-1b5a-4b1e-886c-50e4e2fdfa28)은 중단했다. 같은 main 소스에 앱 버전을 `1.0.1`로 조정한 뒤 위 14번 빌드로 성공했다. 취소된 작업은 성공 빌드로 기록하지 않는다.
- EAS Submit의 `--what-to-test`가 `Changelog submission is currently available for Enterprise plan only`로 거절되면 해당 옵션을 빼고 같은 build ID로 제출한다. 이 오류는 제출 예약 단계의 제한이며, 빌드를 다시 실행할 필요가 없다. 테스트 내용은 App Store Connect에서 직접 입력할 수 있다.

## Apple 전화 인증번호가 맞는데 거절되는 경우

일부 Apple 계정은 문자 대신 전화(`pushMode: voice`)로 인증번호를 보낸다.
EAS CLI 25.3.0의 인증 라이브러리는 이를 문자(`mode: sms`)로 검증하여 `Invalid code`로 거절할 수 있다.
[관련 EAS 이슈](https://github.com/expo/eas-cli/issues/3618)와
[Fastlane의 실제 수신 방식 처리](https://github.com/fastlane/fastlane/blob/master/spaceship/lib/spaceship/two_step_or_factor_client.rb)를 참고한다.

빌드 5는 앱 소스나 설치된 CLI 파일을 바꾸지 않고, 해당 CLI 실행에만 전화 요청·검증 모드를 `voice`로 맞춰 인증했다.
실제 인증번호 검증은 Apple 서버가 수행하며, 인증번호·비밀번호는 터미널에만 입력한다.
같은 오류가 재발하면 인증번호를 반복 입력하거나 신뢰하는 전화번호를 삭제하지 말고 CLI가 실제 수신 방식으로 검증하는지 먼저 확인한다.
