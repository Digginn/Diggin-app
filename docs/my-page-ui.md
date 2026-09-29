# MY 페이지 UI 구현 현황

관련 이슈: [#41 — My 페이지 UI 퍼블리싱](https://github.com/Digginn/Diggin-app/issues/41)

이 작업은 UI 퍼블리싱입니다. 서버 저장·조회, 인증 처리, 계정 삭제를 구현한 것은 아닙니다.

## 구현한 화면

| 화면           | 경로 또는 진입점         | 구현 범위                                                                              |
| -------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| MY             | `/(tabs)/my`             | 프로필·활동·고객지원·설정 메뉴와 화면 이동                                             |
| 프로필 수정    | `/profile-edit`          | 닉네임 입력·검증·안내 문구, 사진 영역 전체 터치, 촬영/앨범 선택, 결과 토스트           |
| 내가 쓴 글     | `/my-posts`              | 게시글/투표 탭, 목록·말줄임·상세 선택 콜백                                             |
| 내가 투표한 글 | `/my-voted-posts`        | 참여 목록과 신고 모달                                                                  |
| CSV 불러오기   | `/csv-import`            | 시스템 파일 선택, CSV 확장자 검사, 소개·진행·결과·제외 목록·오류 안내, 반복 애니메이션 |
| 알림 설정      | `/notification-settings` | 전체·투표 종료·댓글·좋아요 토글, 저장 실패 복구와 회색 토스트                          |
| 고객지원       | MY → 1:1 문의            | 카카오 채널 바로 이동, 이동 실패 시 `/customer-support`, 링크 복사                     |
| 이용약관       | `/terms`                 | 이용약관·개인정보 처리방침·오픈소스 라이센스 목록과 문서 선택 콜백                     |
| 로그아웃       | MY → 로그아웃            | 확인 창, 돌아가기, 요청 중 중복 실행 방지, 실패 안내                                   |
| 회원탈퇴       | MY → 회원 탈퇴           | 확인·완료 창, 닫기, 실패 후 재시도, 요청 중 중복 실행 방지                             |

## 데이터·인증 연결 경계

- `ProfileEditScreen`: `onSaveNickname`, `onSavePhoto`로 실제 저장을 연결합니다. 닉네임 중복 검사는 서버에서 해야 합니다. 가입 수단·현재 닉네임 등 현재 표시값도 실제 사용자 데이터 연결이 필요합니다.
- `MyPostsScreen`, `MyVotedPostsScreen`: 목록 데이터와 상세/신고 콜백을 사용처에서 전달합니다. 현재 라우트의 목록은 UI 확인용 예시이며 상세 화면과 신고 API는 미연결입니다.
- `CsvImportScreen`: `onSelectCsv(file, onProgress)`에서 파싱·상품 등록을 처리하고 결과를 반환합니다. 진행/결과를 props로 전달할 수도 있습니다. 파일 선택만으로 서버에 상품을 등록하지 않습니다.
- `NotificationSettingsScreen`: `initialSettings`, `onSaveSettings`로 설정 조회·저장을 연결합니다. 현재 라우트는 로컬 UI 상태만 바꾸며 앱을 다시 열면 저장되지 않습니다. 전체 OFF는 하위 알림을 비활성화하고 다시 ON하면 이전 선택을 복원합니다. 실제 푸시 권한 요청은 미구현입니다.
- `TermsScreen`: `onPressDocument`에 문서 종류 `terms | privacy | licenses`를 전달합니다. 본문·공식 URL이 제공되지 않아 미연결 메뉴는 준비 중 안내를 표시합니다.
- `MyScreen`: `onLogout`에 세션 종료와 후속 이동을 연결합니다. `onWithdraw`에는 계정 삭제·로그아웃·온보딩 이동을 연결합니다. 미연결 상태에서는 완료한 것으로 처리하지 않고 준비 중 안내를 표시합니다.
- 회원탈퇴는 [완료 시안의 주석](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=753-6630)에 따라 동의 후 완료 창으로 전환하고, 완료 창의 **확인**에서 `onWithdraw`를 실행합니다. X/뒤로 가기는 요청 없이 취소합니다. 호출 실패 시 탈퇴 확인 창으로 돌아가 회색 토스트를 표시합니다. 따라서 실제 인증 연결 시 완료 문구와 삭제 실행 시점의 관계를 PM/디자이너와 재확인해야 합니다.
- 고객지원은 Figma에 명시된 카카오 채널 URL을 사용합니다. 앱 정보의 버전명 표시는 예시입니다.

## 확인 방법

```bash
npm install
npm start
npm run typecheck
npm run lint
node --test scripts/*.test.cjs
```

Expo Go에서 MY로 이동하여 각 메뉴를 확인합니다. Android USB 테스트 시 `adb reverse tcp:8081 tcp:8081`을 설정하고 로컬 Metro에 연결합니다.

개발용 미리보기는 다음과 같습니다. 모두 실제 서버 저장·삭제 없이 UI를 확인합니다.

- `/my-result-preview`: 프로필 결과 토스트.
- MY → CSV 메뉴 길게 누르기: `/csv-import-preview`의 소개·진행·성공/실패·제외 목록 예시.
- MY → 알림 설정 길게 누르기: 저장 실패와 이전 토글 상태 복원.
- MY → 1:1 문의 길게 누르기: 채널 이동 없이 고객지원 대체 화면.
- MY → 회원 탈퇴 길게 누르기: 완료 창의 첫 확인은 모의 실패, 다시 동의하고 확인하면 모의 성공 후 MY로 복귀. 실제 온보딩 이동이 아닙니다.

Android 실기기에서 주요 화면·모달·파일 선택·링크 복사·CSV 버튼 하단 간격을 확인했습니다. iOS 실기기 및 시뮬레이터는 확인하지 못했습니다. 하단 인셋 0·14·34·60dp에서 CSV 버튼 최소 44dp 여백을 자동 테스트합니다. 네이티브 사진 권한 문구 변경은 Expo Go만으로 검증할 수 없으므로 별도 앱 빌드가 필요합니다.

## 주요 디자인 기준

- [MY 기본 화면](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=804-23350)
- [프로필 수정](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=353-2932)
- [내가 쓴 글](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=923-3190), [내가 투표한 글](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=1534-16323)
- [CSV 소개 및 버튼 간격](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=1896-26240)
- [알림 설정](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=757-6262)
- [고객지원](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=757-6340), [약관 목록](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=804-23079)
- [로그아웃](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=1162-6895), [회원탈퇴 확인](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=930-5676), [완료](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=753-6630), [실패](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N/?node-id=1783-23665)
