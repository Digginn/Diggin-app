# Android 빌드

## 최근 QA 빌드

- 버전: `1.0.2`, versionCode: `7`
- 파일 형식: Google Play 내부 테스트용 AAB
- [EAS 빌드](https://expo.dev/accounts/diggin/projects/Diggin/builds/ce03cf01-127a-4f1f-abe0-2c5edac126ec)
- 소스: develop `74e178fd58fc016aed31c723308d08dd37a48041`에 버전 준비를 적용한 `7d330f9078de781f1072f9f9f4c99991cb7ba7e3`
- 프로필: `qa`, EAS 환경·OTA 채널: `preview`, DB: Diggin-dev
- 패키지: `com.diggin.app`
- runtime fingerprint: `58ae7499c9f2ee54668d1f0d85d2e68af7255f07`
- 내려받은 AAB의 네이티브 manifest에서 버전·패키지·preview 채널을 확인했다. JavaScript 번들은 개발 DB 주소를 포함하고 운영 DB 주소는 포함하지 않는다. 내장 fingerprint도 EAS 기록과 일치한다.
- AAB·빌드 정보·SHA-256·빌드 당시 app.json은 `Documents/DigginReleases/android/1.0.2-7-qa/`에 보관한다.

## 설치와 다음 빌드

AAB는 Google Play Console의 내부 테스트 트랙에 등록해 테스터 링크로 설치한다. 이번 작업은 파일 다운로드·검증까지이며 Play 업로드·게시를 실행하지 않았다. 자세한 순서는 [개발 QA와 운영 배포](QA_RELEASE.md)를 따른다.

다음 QA 빌드는 develop에서 `qa` 프로필을, 운영 릴리스는 승인·병합된 main에서 `production` 프로필을 사용한다. 빌드 전 EAS와 Play Console의 마지막 versionCode를 확인한다. 개발 DB용 QA AAB를 프로덕션으로 승격하지 않는다.

각 빌드 worktree에 `npm ci`로 의존성을 독립 설치한다. OTA는 대상 플랫폼의 빌드 당시 app.json과 같은 native 설정에서 runtime 일치를 확인한 뒤 게시한다. [EAS Update 안내](EAS_UPDATE.md)를 참고한다.
