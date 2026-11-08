# iOS 빌드

## 최근 빌드

- 버전: `1.0.0 (13)`
- 소스: develop `2e938087d0afa61c6179c6da505fb543b54d3f31` (main 병합 커밋 `1f213311ec29afb28dee9c1af03436107e7739cf`와 소스 트리 동일)
- [EAS 빌드](https://expo.dev/accounts/diggin/projects/Diggin/builds/6b85b3a2-cc87-49c7-837c-e2ef61038997)
- [App Store Connect 업로드](https://expo.dev/accounts/diggin/projects/Diggin/submissions/dd150455-5180-47f9-acaa-a405b1192a06): EAS Submit 완료. 2026-11-08 13:44 UTC 기준 Apple 빌드 조회는 아직 `NOT_VISIBLE_YET`이며 처리 완료·TestFlight 노출은 별도 확인이 필요하다.
- 본 앱과 공유 확장의 버전·서명, 운영용 APNs 권한, App Group, 소셜 로그인 URL 스킴, 운영 Supabase 주소, iPhone 전용 설정을 IPA에서 확인했다.
- 운영 DB·서버 함수 [배포](https://github.com/Digginn/Diggin-app/actions/runs/42485489809) 성공 후 닉네임 응답과 CSV 이미지 컬럼·RPC 적용을 읽기 전용으로 확인했다.
- IPA·검증 기록: `Documents/DigginReleases/ios/Diggin-1.0.0-13.ipa` 및 같은 이름의 JSON. SHA-256: `ed2b477d6f8ed703a9e722224357774949a8c2d7cf55d021d20230fe57d75497`.
- 빌드 성공과 TestFlight 업로드는 별개다. TestFlight 확인 전에는 App Store Connect 업로드 및 처리가 필요하다.

## 다음 빌드

- 최신 develop의 정확한 커밋을 별도 빌드용 worktree에서 사용한다.
- `npm ci` 후 `eas build --platform ios --profile production`으로 빌드한다.
- EAS의 production 환경을 사용하고 로컬 DB 주소가 포함된 `.env`는 복사하지 않는다.
- `autoIncrement`가 빌드 번호를 올린다. 성공한 빌드 번호만 저장소에 반영한다.
- IPA와 빌드 정보·SHA-256을 기존 `Documents/DigginReleases/ios` 보관 위치에 남긴다.

## Apple 전화 인증번호가 맞는데 거절되는 경우

일부 Apple 계정은 문자 대신 전화(`pushMode: voice`)로 인증번호를 보낸다.
EAS CLI 25.3.0의 인증 라이브러리는 이를 문자(`mode: sms`)로 검증하여 `Invalid code`로 거절할 수 있다.
[관련 EAS 이슈](https://github.com/expo/eas-cli/issues/3618)와
[Fastlane의 실제 수신 방식 처리](https://github.com/fastlane/fastlane/blob/master/spaceship/lib/spaceship/two_step_or_factor_client.rb)를 참고한다.

빌드 5는 앱 소스나 설치된 CLI 파일을 바꾸지 않고, 해당 CLI 실행에만 전화 요청·검증 모드를 `voice`로 맞춰 인증했다.
실제 인증번호 검증은 Apple 서버가 수행하며, 인증번호·비밀번호는 터미널에만 입력한다.
같은 오류가 재발하면 인증번호를 반복 입력하거나 신뢰하는 전화번호를 삭제하지 말고 CLI가 실제 수신 방식으로 검증하는지 먼저 확인한다.
