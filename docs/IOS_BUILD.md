# iOS 빌드

## 최근 빌드

- 버전: `1.0.0 (6)`
- 소스: develop `b656c5a1913cdba7b0290324d3b3668b3503caa3`
- [EAS 빌드](https://expo.dev/accounts/diggin/projects/Diggin/builds/2056755f-aef3-47d9-842b-722055d525ba)
- IPA의 본 앱·공유 확장 ID와 빌드 번호, 소셜 로그인 URL 스킴, 운영 Supabase 주소를 확인했다. 포함된 프로비저닝 프로필의 운영 APNs·Apple 로그인·App Group 권한도 확인했다.
- App Store Connect 업로드와 Apple 처리가 완료됐다. TestFlight 내부 테스트 상태는 IN_BETA_TESTING이며 외부 테스트 상태는 READY_FOR_BETA_SUBMISSION이다.
- [EAS 제출](https://expo.dev/accounts/diggin/projects/Diggin/submissions/5edd69ab-a7c1-4469-9f5d-85801bc566f7)
- IPA: Documents/DigginReleases/ios/Diggin-1.0.0-6.ipa
- SHA-256: bfaef5e3c92f8f13a9db2741777bab9f6e818d8a3f2909e733d8164eef4e29a0

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
