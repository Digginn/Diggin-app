# Android 공유 수신 (#132)

Android 공유 메뉴의 Diggin을 선택하면 Expo Sharing의 `ACTION_SEND` / `text/plain` 수신 값으로 저장 화면을 연다.
웹 URL이나 `diggin://` 쿼리로 상품 주소를 직접 전달하지 않는다. 링크 추출·검증, 정보 수정, 중복·오류 안내는 iOS와 공통인 `ShareSaveScreen`을 사용한다.

- 로그인 상태: 정보 수정 → 저장 → 완료 안내 후 원래 앱으로 복귀한다. 중복 확인을 선택하면 기존 아이템 상세를 연다.
- 비회원: 유효한 링크만 앱 전용 파일에 맡기고 로그인으로 이동한다. 로그인·신규 가입 완료 후 ALL의 기존 저장 흐름으로 이어 간다. 로그인을 취소하면 링크를 버린다.
- 취소 또는 로딩 중 뒤로가기: 공유 값을 비운 뒤 원래 앱으로 복귀한다. 편집 중 뒤로가기는 기존 시트의 입력 폐기 확인을 사용한다.
- 공유 화면이 열린 중 다른 공유를 받아도 새로운 수신 값으로 화면을 갱신한다.
- 공유 값은 진입 시 한 번 상태에 보관하고 네이티브 저장소에서 즉시 지운다. 공유 값 없이 딥링크로 진입하면 ALL로 이동한다.
- 파일·이미지 및 여러 파일 공유는 지원 대상이 아니다. HTTPS만 받는 기존 정책을 유지한다.

## 검증

- `node --test scripts/android-share.test.cjs scripts/share-extension.test.cjs scripts/login.test.cjs`
- Expo config introspection에서 Android SEND intent filter 및 기존 iOS 공유 확장 1개 유지를 확인한다.
- 새 네이티브 모듈이 포함돼 기존 설치 앱의 JS 갱신만으로는 사용할 수 없다. 이 PR 머지 후 Android 빌드에 반영해야 한다.
- 리뷰 반영 후 Linux 임시 환경(Node 22)에서 lockfile 기준 `npm ci`와 `expo prebuild --platform ios --no-install`을 실행했다. 테스트용 Google/Kakao 설정값으로 프로젝트 생성만 검증했으며, xcode 4.0의 본 앱·기존 공유 확장 2개 타깃, 확장 iOS 16.4, Expo factory 적용과 Podfile의 `expo-sharing` 단일 제외를 확인했다.
- `pod install`과 iOS 컴파일은 미실행이다. 현재 Windows 환경에 CocoaPods/Xcode가 없어 macOS에서 추가 확인해야 한다.

## 실기기 확인 항목

- [ ] 앱 종료·백그라운드·실행 중 쇼핑 앱에서 링크 공유
- [ ] 같은 링크 연속 공유 및 공유 화면이 열린 중 다른 링크 공유
- [ ] 비회원 → 로그인 성공 / 신규 가입 / 로그인 취소
- [ ] 저장 성공 후 원래 앱 복귀, 중복 확인·취소, 저장 실패 후 입력 유지
- [ ] 편집 중 시스템 뒤로가기의 입력 폐기 확인
- [ ] Diggin에서 게시글·투표 작성 중 다른 앱의 공유를 열고 저장/취소했을 때 작성 화면·입력 보존 여부 확인 (`BackHandler.exitApp()`의 Activity 종료 영향 포함)

현재 실기기 검증은 미실시다. USB 연결 기기가 감지되지 않았다.
