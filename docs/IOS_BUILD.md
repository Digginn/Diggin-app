# iOS 빌드

## 최근 빌드

- 버전: `1.0.2 (15)` — 개발 DB용 TestFlight QA 빌드
- 소스: develop `74e178fd58fc016aed31c723308d08dd37a48041`에 버전 준비 커밋 `3b9c86ce43fa61f977e5e32cd26afd6d9e5059e4` 적용
- [EAS 빌드](https://expo.dev/accounts/diggin/projects/Diggin/builds/a436197e-b3b0-46c9-b339-3e635896cac3)
- 프로필: `qa`, EAS 환경·업데이트 채널: `preview`
- iOS runtime fingerprint: `2fe018cfad7280cca4b051dc4a41ea8833af74c0`
- 내려받은 IPA에서 본 앱과 공유 확장이 개발 Supabase 주소를 포함하고 운영 주소는 포함하지 않는 것을 확인했다. 본 앱의 업데이트 채널은 preview다.
- IPA·빌드 정보·SHA-256은 `Documents/DigginReleases/ios/1.0.2-15-qa/`에 보관한다.
- [App Store Connect 제출](https://expo.dev/accounts/diggin/projects/Diggin/submissions/26112dec-77c4-46b5-8523-048cf875d3c6)은 빌드와 별도다. 이 QA 빌드는 App Store 정식 출시 대상으로 선택하지 않는다.

## 다음 빌드

- 개발 QA는 develop의 정확한 커밋, 운영 릴리스는 승인·병합된 main의 정확한 커밋을 별도 빌드용 worktree에서 사용한다.
- 각 빌드 worktree에서 `npm ci`로 의존성을 독립 설치한다. 다른 폴더의 `node_modules`를 junction·심볼릭 링크로 연결하면 로컬과 EAS의 fingerprint가 달라져 빌드가 실패할 수 있다.
- TestFlight 개발 QA는 `eas build --platform ios --profile qa`, 운영은 `--profile production`으로 빌드한다. 자세한 순서는 [개발 QA와 운영 배포](QA_RELEASE.md)를 따른다.
- QA는 EAS preview, 운영은 production 환경을 사용한다. 기존 작업 폴더의 `.env`는 복사하지 않는다.
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
