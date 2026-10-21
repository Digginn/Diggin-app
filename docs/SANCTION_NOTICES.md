# 제재 안내 UI (RPT-006)

현재 전용 제재 안내가 없어 Figma 기준으로 UI를 추가했다. 서버 상태 조회 및 실제 제재 적용은 #114에서 연결한다.

| 안내                     | 구현                                                                      |
| ------------------------ | ------------------------------------------------------------------------- |
| MSG-REPORT-006 경고      | `SanctionNoticeModal`, `type: warning`, 확인 버튼                         |
| MSG-REPORT-007 7일 제한  | `type: community_restricted`, `restrictedUntil`, `reasonLabel`, 문의·확인 |
| MSG-REPORT-008 참여 제한 | `restrictionToastMessage(restrictedUntil)` + `ToastText`의 `notice` 변형  |
| MSG-REPORT-009 영구 제한 | `type: suspended`, `reasonLabel`, 문의·확인                               |

- 종료일은 서버 시각을 기기 현지 날짜 `YYYY.MM.DD`로 변환한다. 잘못된 날짜는 기간을 특정하지 않는 문구로 표시한다.
- 제재 사유는 운영자가 선택한 표시 문자열을 전달한다. UI에서 특정 위반 유형을 기본값으로 만들지 않는다.
- 모달은 바깥 영역·뒤로가기로 닫히지 않는다. 확인 동작은 호출자가 전달한다.
- 문의 버튼은 기존 카카오 고객지원 채널을 연다. 실패 시 모달을 유지하고 모달 위에 오류 Toast를 표시한다.
- 실제 최초 진입 안내·제재 건당 1회 확인 저장·참여 요청 차단·세션 종료·로그인 차단은 #114의 범위다. 이 UI만으로 제재가 적용되지는 않는다.
- 로그인 화면 배경은 기존 `LoginScreen`을 재사용한다. 배경의 기존 로그인 애니메이션·레이아웃 차이는 이번 변경 범위에 포함하지 않는다.

개발 빌드에서 `/sanction-preview`에 진입해 네 종류를 선택한다. `?type=warning`, `restricted`, `toast`, `suspended`로 직접 확인할 수도 있다. 미리보기의 날짜·사유는 예시이며 계정·DB를 변경하지 않는다. 릴리스 빌드에서는 시작 화면으로 이동한다.
