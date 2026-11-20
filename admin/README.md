# Diggin 관리자 웹

모바일 Expo 앱과 같은 저장소에서 관리하되 실행·의존성·빌드는 분리한 React + Vite + TypeScript 웹 앱입니다. 소스는 `admin/`, 배포 결과물은 `admin/dist/`입니다. 별도 npm workspace 전환 없이 `admin/package-lock.json`으로 의존성을 고정합니다.

현재 진입 화면은 관리자 화면 상태를 선택하는 미리보기입니다. 로그인 입력·오류·비로그인 진입 안내, 신고 목록의 프로필 메뉴, 로그아웃 확인·완료 흐름을 확인할 수 있습니다. 사용자와 합의한 이번 범위는 화면과 전환 동작이며, 실제 운영자 인증과 신고 조회·조치 API는 연결하지 않았습니다.

## 실행과 검증

Node.js 22.12 이상을 사용합니다.

```powershell
# 저장소 루트에서 실행
npm ci --prefix admin
npm --prefix admin run dev
# http://127.0.0.1:5173

npm --prefix admin run typecheck
npm --prefix admin run build
npm --prefix admin run preview
```

브라우저 검증은 Windows에서 설치된 Microsoft Edge를 사용합니다. 다른 환경에서는 Chromium을 설치합니다.

```powershell
cd admin
# Windows 외 환경에서 최초 1회
npx playwright install chromium
npm test
```

Playwright가 4173번 포트의 서버를 실행하고 종료합니다. 공통 컴포넌트와 화면 전환을 검사합니다. 실제 운영체제 IME 입력은 별도 수동 확인 대상입니다. `tests/browser-harness.tsx`는 로그인·로그아웃 콜백을 지연·실패시켜 중복 제출과 재시도를 검증하는 테스트 전용 모듈이며 앱 번들에서는 참조하지 않습니다.

## 화면과 이동 경로

로컬 주소 뒤에 아래 해시 경로를 붙입니다. 기존 공통 컴포넌트는 `/#/components`에서 확인합니다.

| 경로                         | 화면 / Figma node                                                 |
| ---------------------------- | ----------------------------------------------------------------- |
| `/#/designs` 또는 `/`        | 상태 선택, 구역 제목 ‘로그인 · 비로그인 · 로그아웃’ / 7068:144779 |
| `/#/designs/login`           | 로그인 기본 / 7068:144804                                         |
| `/#/designs/login-filled`    | 로그인 입력 완료 / 7068:144825                                    |
| `/#/designs/login-error`     | 자격 증명 오류 / 7068:144846                                      |
| `/#/designs/login-required`  | 비로그인 진입 안내 / 7068:144780                                  |
| `/#/designs/reports-profile` | 신고 목록·프로필 메뉴 / 7068:144892                               |
| `/#/designs/logout-confirm`  | 로그아웃 확인 모달 / 7068:144996                                  |
| `/#/designs/logged-out`      | 로그아웃 완료 토스트·초기화된 입력란 / 7068:144868                |
| `/#/preview/reports`         | 메모리의 미리보기 로그인 상태를 사용하는 진입 흐름                |

입력란에 올바른 이메일 형식과 임의의 예시 비밀번호를 입력하면 화면 전환을 확인할 수 있습니다. 기본 제공 비밀번호 `preview123`은 화면 검증용 문자열이며 실제 계정 자격 증명이 아닙니다. `login-error` 경로는 재시도 시에도 오류를 반환하도록 고정한 오류 상태 예시입니다.

입력값은 서버로 전송하지 않고 localStorage·sessionStorage에도 저장하지 않습니다. 화면의 로그인 상태는 메모리에만 유지하므로 새로고침하면 초기화됩니다. 실제 인증·관리자 권한 검증 기능으로 사용하면 안 됩니다. 신고 목록은 `src/preview-data/reports.ts`의 Figma 예시 8개를 사용합니다.

- 비밀번호 표시/숨김, Enter 제출, 처리 중 중복 제출 차단, 실패 후 재시도를 지원합니다.
- 프로필 메뉴는 바깥 클릭·Tab 이동·Escape로 닫히며, 로그아웃 모달은 native `<dialog>`의 포커스 제한과 취소·Escape·배경 클릭을 지원합니다. 처리 중에는 모달 닫기와 재제출을 막고 실패 시 재시도를 허용합니다.
- 로그아웃하면 입력값을 비우고 상단 32px 위치에 완료 토스트를 2.5초 표시합니다.
- 신고 상태·콘텐츠 유형·검색을 조합해 목록을 좁힐 수 있습니다. 요약 카드와 미처리 배지는 전체 예시 데이터 기준입니다.
- 제재 이력·회원 관리 화면과 신고 상세는 이번 디자인 범위에 없습니다. 사이드 메뉴는 비활성 상태이며, 신고 행 선택은 미리보기 알림으로 확인합니다.
- 로그인 카드·모달은 작은 화면에도 맞추고, 신고 목록은 데스크톱 레이아웃을 기준으로 표 영역을 가로 스크롤합니다. 모달 위치는 Figma의 2000px 캔버스 절대 좌표 대신 현재 뷰포트 중앙으로 맞춥니다.

루트 도구 설치 후 기존 규칙으로 관리자 코드도 검사할 수 있습니다.

```powershell
npm exec -- eslint admin/src admin/tests admin/vite.config.ts admin/playwright.config.ts
```

## Figma 대응

[관리자 컴포넌트 원본](https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N?node-id=7068-140643)

| 컴포넌트               | Figma node               | 구현                                                                          |
| ---------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| Icons / Wordmark/Admin | 7068:140644 / 6232:87614 | `AdminIcon.tsx` · 아이콘 19종, 80×25.6 워드마크                               |
| StatusBadge            | 6232:87621               | `Badges.tsx` · 접수/검토 중/처리 완료/반려                                    |
| TypeBadge / ReasonTag  | 6232:87634 / 6232:87639  | `Badges.tsx` · 게시글/댓글, 선택적 건수                                       |
| AdminBtn               | 6232:87642               | 5개 종류 × M/S, 선택적 아이콘, native disabled                                |
| FilterTab              | 6232:87673               | 5개 필터, 선택 상태와 외부에서 전달한 건수                                    |
| StatusSegment          | 6232:87779               | 392×44, 4개 상태                                                              |
| SanctionSelect         | 6232:87816               | 392px 2열, 제재 4개, 같은 카드 재선택 시 해제                                 |
| VisibilityControl      | 6232:87946               | 392px, 공개/숨김 전환                                                         |
| AdminToast             | 6232:87961               | 2.5초 후 `onDismiss`, 위치는 사용하는 화면에서 지정                           |
| ReportRow              | 6232:87968               | 1128×89, hover, 행 선택 콜백                                                  |
| NavItem                | 6232:88013               | 200×44, 활성/기본, 선택적 배지                                                |
| ActionReasonField      | 6232:88024               | 392×112, focus, native textarea의 `maxLength=200`과 동일한 UTF-16 단위 카운터 |
| HistoryItem            | 6232:88033               | 392px, 조치 종류별 점 색상, 선택적 사유·연결선                                |

색상·타이포그래피·공통 수치는 `src/theme/tokens.css`에서 관리합니다. Pretendard는 루트 `assets/fonts`를 재사용하며 빌드 결과물에 포함됩니다. 개발 서버는 해당 폰트 디렉터리만 추가 허용합니다.

SVG는 Figma에서 내려받은 원본을 `src/assets`에 보관합니다. 런타임에 Figma URL을 요청하지 않습니다. 일반 아이콘은 원본 SVG의 모양을 CSS 마스크로 재사용해 `currentColor`로 색만 제어합니다. 슬롯 전용 SVG는 원본 색상도 보존합니다. 미리보기 주변의 제목·구분선·배치는 컴포넌트를 확인하기 위한 구성이고, 실제 관리자 화면 디자인은 아닙니다.

## 후속 화면 연결

UI 컴포넌트는 props와 콜백만 사용합니다. 실제 데이터 조회·변경은 화면에서 기존 관리자 API와 연결합니다. 관련 계약은 [`docs/MODERATION_API.md`](../docs/MODERATION_API.md)를 따릅니다.

- 관리자 인증·권한 확인, 데이터 조회의 로딩/오류/빈 상태를 먼저 구현합니다.
- 미리보기의 선택 동작을 그대로 운영 조치로 연결하지 않습니다. 저장·확인 흐름과 서버의 상태 전이 및 조치 규칙에 맞춥니다.
- 클라이언트에 서버 비밀키를 넣지 않으며, 조치 요청은 관리자 인증과 기존 서버 검증을 거칩니다.
- 미리보기는 실제 운영 정보가 없지만 인증된 관리 화면이 아니므로, 운영 관리자 주소로 배포하는 단계는 후속 작업에서 정합니다.
