# Android 알림 (#131)

## 연결 정보

- Firebase/Google Cloud: `diggin-511710`, Android 패키지 `com.diggin.app`.
- `google-services.json`은 공개 클라이언트 식별자 파일로 저장소 루트에 둔다. `app.config.ts`가 연결한다. EAS 파일 환경변수 `GOOGLE_SERVICES_JSON`이 있으면 우선 사용한다.
- FCM V1 서비스 계정 키는 EAS `com.diggin.app`에 등록했다. 비공개 키 파일은 저장소에 넣지 않는다.
- `expo-notifications` 기본 채널과 등록 코드의 채널 ID는 모두 `default`다. Android 13+ 권한 요청 전에 채널을 만든다.
- Android 운영 빌드는 Firebase 설정이 없으면 실패한다. Firebase SDK/Gradle 연결은 Expo prebuild가 처리한다. 이 설정만으로 Analytics SDK가 앱에 추가되지는 않는다.

## 발송 서버 활성화 (승인된 PR 배포 후)

DB·함수는 develop 병합 후 기존 GitHub Actions에서 검증·배포한다. 기능 브랜치에서 공유 DB를 직접 변경하지 않는다.

1. 운영자가 임의의 충분히 긴 비밀값을 만들어 `notification-push` 함수의 `PUSH_DISPATCH_SECRET` 환경변수로 등록한다.
2. Supabase Vault에 `push_dispatch_secret`이라는 이름으로 같은 값을 등록한다.
3. Vault에 `push_dispatch_url`이라는 이름으로 `https://hymfhaowjyzuennxphfz.supabase.co/functions/v1/notification-push`를 등록한다. 다른 환경은 해당 프로젝트 URL을 쓴다.
4. 매분 cron 실행과 함수 상태 코드를 확인한다. 설정이 없으면 함수는 503, DB cron은 호출 없이 종료한다. 비밀값·토큰·알림 본문은 로그에 출력하지 않는다.
5. Expo 프로젝트에서 Push Security가 켜져 있으면 `EXPO_ACCESS_TOKEN`을 함수 secret으로 추가한다. Firebase 서비스 계정 키를 Supabase에 넣을 필요는 없다.

Expo 접수 성공은 기기 수신 성공과 다르다. 15분 뒤 receipt를 확인하며, 기기별 실패·재시도 상태는 `private.notification_push_deliveries`에서 운영자가 점검한다. 24시간 이상 지난 큐는 종료하고 오래된 알림 삭제 시 큐도 함께 삭제한다.

## 앱 동작

- 인증 복원이 끝난 뒤 초기 알림 응답과 실행 중 선택 리스너를 연결한다. 같은 응답 ID는 한 번만 처리한다.
- payload의 `recipient_id`가 현재 계정과 다르면 상세로 이동하지 않는다. 알 수 없는 payload나 비회원은 알림 목록의 기존 로그인 가드로 보낸다.
- `post_id`는 큰 ID도 보존하도록 문자열로 전달한다. `post_type`은 post/vote만 허용하고 외부 URL은 실행하지 않는다.
- 실행 중 수신하면 알림 목록·빨간 점 캐시를 갱신하고 현재 계정의 배너·소리만 허용한다. iOS 수신 코드는 변경하지 않는다.
- 앱 알림 토글은 서버 발송 대기열과 발송 시점 모두에 적용된다. OS 권한 거부 시 토큰을 새로 등록하지 않으며, 로그아웃은 현재 기기 토큰을 제거한다.

## 검증

자동 검증은 `scripts/android-push.test.cjs`, `scripts/push-notifications.test.cjs`, `supabase/tests/notification_push.test.sql`, `supabase/functions/notification-push/handler_test.ts`에서 관리한다.

Android 기기가 연결되지 않아 다음 항목은 빌드 후 확인한다. 아래 검증 전까지 #131을 완료 처리하지 않는다.

- [ ] Android 13+ 최초 허용·거부, OS 설정 변경 후 복귀
- [ ] 실행 중·백그라운드·종료 상태의 댓글/좋아요/투표 마감 Push 수신
- [ ] 알림 선택 시 게시글·투표 이동, 삭제/숨김 안내, 중복 이동 방지
- [ ] 앱 알림 끄기/켜기, 차단/신고 후 미발송
- [ ] 로그아웃·계정 전환 후 이전 계정 알림 차단
- [ ] 여러 기기 발송, receipt 확인 및 재등록 토큰 보호

## 참고

- [Expo FCM V1 설정](https://docs.expo.dev/push-notifications/fcm-credentials/)
- [Expo 발송·ticket·receipt](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Supabase 예약 함수](https://supabase.com/docs/guides/functions/schedule-functions)
