# Android 알림 및 공통 Push 처리 (#131)

## 연결 정보

- Firebase/Google Cloud: `diggin-511710`, Android 패키지 `com.diggin.app`.
- `google-services.json`은 공개 클라이언트 식별자 파일로 저장소 루트에 둔다. `app.config.ts`가 연결한다. EAS 파일 환경변수 `GOOGLE_SERVICES_JSON`이 있으면 우선 사용한다.
- FCM V1 서비스 계정 키는 EAS `com.diggin.app`에 등록했다. 비공개 키 파일은 저장소에 넣지 않는다.
- `expo-notifications` 기본 채널과 등록 코드의 채널 ID는 모두 `default`다. Android 13+ 권한 요청 전에 채널을 만든다.
- 공유 확장의 `excludedPackages`는 문자열만 받는다. `expo-notifications`는 문자열로 제외하고 `defaultChannel` 옵션은 루트 plugins에만 둔다. 리뷰 수정 후 lockfile 기준 Linux iOS prebuild에서 생성된 Podfile의 제외 항목을 확인했다. macOS `pod install`과 iOS 컴파일은 별도 검증이 필요하다.
- Android 운영 빌드는 Firebase 설정이 없으면 실패한다. Firebase SDK/Gradle 연결은 Expo prebuild가 처리한다. 이 설정만으로 Analytics SDK가 앱에 추가되지는 않는다.

## Android Google 로그인 서명 확인

- 앱은 기존 `GoogleSignin.configure({ webClientId, iosClientId })`와 Supabase 로그인 흐름을 사용한다. Firebase Authentication으로 전환하지 않는다. 현재 JSON의 웹 클라이언트 ID는 앱 설정과 일치한다.
- Google 로그인은 Android 패키지와 실제 APK의 SHA-1에 맞는 Android OAuth 클라이언트가 필요하다. JSON에 Android 항목이 없다는 사실만으로 Google Cloud 등록 여부를 확정할 수는 없다. 서명 등록 후 새 Firebase 설정 파일과 실제 APK 로그인으로 확인한다.
- EAS에서 확인한 `com.diggin.app` SHA-1: `2F:11:D1:BA:75:4F:51:0C:F6:71:11:67:C0:94:4C:54:FA:B4:FD:A3`.
- Firebase 지문 추가 후 Google Cloud에서 `Diggin Android EAS`·`Diggin Android Play` Android OAuth 클라이언트를 생성했다. 새 `google-services.json`의 Android 클라이언트 2개, 패키지·프로젝트, EAS 인증서 해시 일치 및 기존 웹 클라이언트 유지를 확인해 반영했다.
- 사용자가 Play 앱 서명 키에서 복사해 등록한 지문은 `F5:50:7B:F2:84:4A:9B:FF:78:49:F5:B3:2C:D2:67:93:49:12:A4:72`이며 새 JSON의 Android 인증서 해시로 확인했다. Google Play가 앱을 재서명하므로 Play 설치 빌드는 이 지문으로 검증한다.
- 로컬 debug SHA-1은 아직 확보하지 않았다. 실제 debug APK를 사용하는 경우 해당 서명을 확인해 추가한다. EAS 직접 설치·Play 설치의 실제 Google 로그인 검증도 빌드 후 진행한다.

## 발송 서버 활성화 (승인된 PR 배포 후)

DB·함수는 develop 병합 후 기존 GitHub Actions에서 검증·배포한다. 기능 브랜치에서 공유 DB를 직접 변경하지 않는다.

1. 운영자가 임의의 충분히 긴 비밀값을 만들어 `notification-push` 함수의 `PUSH_DISPATCH_SECRET` 환경변수로 등록한다.
2. Supabase Vault에 `push_dispatch_secret`이라는 이름으로 같은 값을 등록한다.
3. Vault에 `push_dispatch_url`이라는 이름으로 `https://hymfhaowjyzuennxphfz.supabase.co/functions/v1/notification-push`를 등록한다. 다른 환경은 해당 프로젝트 URL을 쓴다.
4. 매분 cron 실행과 함수 상태 코드를 확인한다. 설정이 없으면 함수는 503, DB cron은 호출 없이 종료한다. 비밀값·토큰·알림 본문은 로그에 출력하지 않는다.
5. Expo 프로젝트에서 Push Security가 켜져 있으면 `EXPO_ACCESS_TOKEN`을 함수 secret으로 추가한다. Firebase 서비스 계정 키를 Supabase에 넣을 필요는 없다.

Expo 접수 성공은 기기 수신 성공과 다르다. 15분 뒤 receipt를 확인하며, 기기별 실패·재시도 상태는 `private.notification_push_deliveries`에서 운영자가 점검한다. 24시간 이상 지난 큐는 종료하고 오래된 알림 삭제 시 큐도 함께 삭제한다.

## 앱 동작

- iOS·Android 공통 `PushNotifications`에서 인증 복원이 끝난 뒤 초기 알림 응답과 실행 중 선택 리스너를 연결한다. 같은 응답 ID는 한 번만 처리하며 웹에는 연결하지 않는다.
- payload의 `recipient_id`가 현재 계정과 다르면 상세로 이동하지 않는다. 알 수 없는 payload나 비회원은 알림 목록의 기존 로그인 가드로 보낸다.
- `post_id`는 큰 ID도 보존하도록 문자열로 전달한다. `post_type`은 post/vote만 허용하고 외부 URL은 실행하지 않는다.
- iOS·Android 모두 실행 중 수신하면 알림 목록·빨간 점 캐시만 갱신하고 OS 배너·알림 목록 표시·소리는 끈다(NOTI003~005). 백그라운드·종료 상태의 OS Push 표시는 유지한다.
- 댓글 알림은 대기열에 넣을 때와 발송 직전에 원문 댓글의 삭제 여부를 확인한다(NOTI004). 이미 삭제된 댓글은 발송하지 않는다.
- 앱 알림 토글은 서버 발송 대기열과 발송 시점 모두에 적용된다. OS 권한 거부 시 토큰을 새로 등록하지 않으며, 로그아웃은 현재 기기 토큰을 제거한다.
- 매분 DB 점검 시 처리 시각이 된 pending·receipt 작업이 있고 lease가 없거나 만료됐을 때만 Edge Function을 호출한다. 새 발송이 없어도 receipt 확인·실패 재시도는 이어 간다.
- `cron-run-details-cleanup`은 매일 18:10 UTC(한국 시간 다음 날 03:10)에 완료된 지 7일 지난 크론 실행 기록을 정리한다. 최근 기록과 실행 중인 작업은 보존한다.

## 검증

자동 검증은 `scripts/android-push.test.cjs`, `scripts/push-notifications.test.cjs`, `supabase/tests/notification_push.test.sql`, `supabase/functions/notification-push/handler_test.ts`에서 관리한다.

Android 기기가 연결되지 않아 다음 항목은 빌드 후 확인한다. 아래 검증 전까지 #131을 완료 처리하지 않는다.

- [ ] Android 13+ 최초 허용·거부, OS 설정 변경 후 복귀
- [ ] 실행 중·백그라운드·종료 상태의 댓글/좋아요/투표 마감 Push 수신
- [ ] 알림 선택 시 게시글·투표 이동, 삭제/숨김 안내, 중복 이동 방지
- [ ] 앱 알림 끄기/켜기, 차단/신고 후 미발송
- [ ] 로그아웃·계정 전환 후 이전 계정 알림 차단
- [ ] 실제 Android 설치 빌드에서 Google 로그인 확인 (설치 경로별 SHA-1 등록 포함)
- [ ] 여러 기기 발송, receipt 확인 및 재등록 토큰 보호

## 참고

- [Expo FCM V1 설정](https://docs.expo.dev/push-notifications/fcm-credentials/)
- [Expo 발송·ticket·receipt](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Supabase 예약 함수](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase 크론 실행 기록 정리](https://supabase.com/docs/guides/cron/quickstart#clean-up-job-run-history)
- [Google Sign In 서명 설정](https://react-native-google-signin.github.io/docs/setting-up/get-config-file)
- [Play 앱 서명 확인](https://support.google.com/googleplay/android-developer/answer/9842756?hl=ko)
