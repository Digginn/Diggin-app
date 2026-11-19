# Diggin 관리자 웹

모바일 Expo 앱과 같은 저장소에서 관리하되 실행·의존성·빌드는 분리한 React + Vite + TypeScript 웹 앱입니다. 소스는 `admin/`, 배포 결과물은 `admin/dist/`입니다. 별도 npm workspace 전환 없이 `admin/package-lock.json`으로 의존성을 고정합니다.

현재 진입 화면은 Figma 관리자 공통 컴포넌트 미리보기입니다. 예시 데이터와 브라우저 내 상태만 사용합니다. 전체 관리자 화면, 로그인, 실제 신고 조회·조치 API는 아직 연결하지 않았습니다.

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

Playwright가 4173번 포트의 서버를 실행하고 종료합니다. 필터·상태 선택, 제재 선택 및 해제, 공개·숨김 왕복, 입력 제한, 키보드 조작, 토스트 2.5초 자동 닫힘, SVG·폰트 로드, 기본 치수와 작은 화면의 가로 넘침을 검사합니다. 테스트의 한글 조합 이벤트 검사는 자동화 범위이며, 실제 운영체제 IME 입력은 별도 수동 확인 대상입니다.

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
