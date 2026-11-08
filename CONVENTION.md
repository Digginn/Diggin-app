# Diggin App Convention

이 문서는 프로젝트의 폴더 구조와 파일 배치, 네이밍, 스타일, Git 작업 기준을 정리합니다.
규칙은 현재 프로젝트 규모에 맞춰 적용하며, 개발 과정에서 불편한 점이 발견되면 팀 논의를 거쳐 수정합니다.

## 1. 파일 및 코드 네이밍

- 컴포넌트와 화면: `PascalCase.tsx`
- `src/app`의 라우트 파일은 Expo Router 규칙을 따릅니다. 예: `index.tsx`, `_layout.tsx`, `[id].tsx`
- 커스텀 훅: `use`로 시작하는 `camelCase.ts`
- 함수와 변수: `camelCase`
- 타입과 인터페이스: `PascalCase`
- 상수: `UPPER_SNAKE_CASE`
- 테마 토큰의 export 이름은 예외적으로 `camelCase`를 사용합니다. 예: `colors`, `fontFamily`, `baseFrame`
- 폴더: `kebab-case`
- 불리언 값은 의미에 따라 `is`(상태: `isLoading`), `has`(존재·보유: `hasPermission`), `can`(가능 여부: `canSubmit`) 접두사를 사용합니다.
- TypeScript의 `any`는 사용하지 않습니다. 타입을 알 수 없다면 `unknown`으로 받고 타입을 좁힙니다.

## 2. NativeWind 및 디자인 시스템

### 기본 원칙

- 정적인 레이아웃과 스타일은 NativeWind의 `className`을 우선 사용합니다.
- 런타임 계산이 필요하거나 NativeWind로 표현하기 어려운 스타일만 `style` 또는 `StyleSheet`을 사용합니다.
- 디자인 시안의 임의 색상과 수치를 컴포넌트에 반복해서 직접 작성하지 않습니다.
- 공통 디자인 값은 토큰으로 정의하고 화면과 컴포넌트에서 재사용합니다.

### 디자인 토큰

```text
src/theme/
├── colors.ts       # Neutral 회색 12단계와 공통 색상
├── typography.ts   # mobile/* 타이포그래피 24종
├── layout.ts       # 기준 프레임, 여백, 거터 등 레이아웃 수치
└── index.ts        # 테마 토큰과 유틸리티 export
```

- `colors.ts`: Neutral 단계의 이름과 실제 색상값을 관리합니다.
- `typography.ts`: 디자인의 `mobile/*` 스타일을 의미가 드러나는 이름으로 매핑합니다.
- `layout.ts`: 기준 프레임 `375 × 812`, 좌우 여백 `24`, 거터 `16` 등 공통 수치를 관리합니다.
- 디자인 토큰은 `src/theme`에서 관리하고, `tailwind.config.ts`에서 가져와 NativeWind 테마와 유틸리티에 연결합니다.
- 색상과 간격은 토큰 이름을 사용하고, 타이포그래피는 `font-<토큰명>` 클래스로 적용합니다.

```tsx
<View className="bg-gray-0 px-margin gap-gutter">
  <Text className="text-gray-900 font-h1">Diggin</Text>
</View>
```

### 아이콘과 이미지

- 이미지와 아이콘은 루트 `assets/images`, 폰트는 `assets/fonts`에 보관합니다.
- 앱 아이콘은 `assets/images/icon-app.png`를 사용하며, `app.json`에서 연결합니다.
- 일반 아이콘 파일은 `icon-<이름>` 형식을 사용합니다.
- 색상별 별도 파일이 필요하다면 `icon-<이름>-<색상명>` 형식을 사용합니다.
- 동일한 SVG의 색상만 다른 경우에는 파일을 복제하기보다 컴포넌트의 `color` 속성으로 제어하는 방식을 우선 검토합니다.

## 3. Git Convention

### 브랜치

```text
<type>/<issue-number>-<description>
```

예시:

```text
chore/3-setting-style
feat/12-login
fix/24-profile-image
```

- `type`과 `description`은 영문 소문자와 kebab-case를 사용합니다.
- 하나의 브랜치에서는 하나의 이슈만 처리합니다.

### 커밋

```text
<type>: <작업 내용> (#<issue-number>)
```

예시:

```text
chore: rn 기본 에셋 파일 삭제 (#1)
feat: 로그인 화면 구현 (#12)
fix: 프로필 이미지 비율 수정 (#24)
```

| Type | 용도 |
| --- | --- |
| `feat` | 새로운 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 기능 변경 없는 코드 구조 개선 |
| `style` | UI 스타일 변경 또는 코드 포맷 수정 |
| `chore` | 설정, 패키지, 빌드 및 기타 작업 |
| `docs` | 문서 작성 및 수정 |
| `test` | 테스트 추가 및 수정 |

- 커밋 메시지는 변경 내용을 구체적으로 작성합니다.
- 커밋 끝에는 관련 이슈 번호를 작성합니다.
- 서로 다른 목적의 변경은 커밋을 분리합니다.

## 4. 폴더 구조

```text
.
├── assets/
│   ├── images/              # 이미지와 앱 아이콘
│   └── fonts/               # 폰트 파일
├── src/
│   ├── app/                 # Expo Router가 인식하는 라우트와 레이아웃
│   ├── api/                 # API 클라이언트와 여러 화면에서 공유하는 요청
│   ├── components/          # 여러 화면에서 사용하는 공통 UI 컴포넌트
│   ├── constants/           # 여러 화면에서 사용하는 공통 상수
│   ├── contexts/            # 여러 화면에서 사용하는 React Context
│   ├── hooks/               # 여러 화면에서 사용하는 공통 커스텀 훅
│   ├── lib/                 # Supabase 등 외부 라이브러리 초기 설정
│   ├── stores/              # 여러 화면에서 공유하는 전역 상태
│   ├── theme/               # 디자인 토큰과 타이포그래피 유틸리티
│   ├── types/               # 여러 영역에서 공유하는 타입과 DB 생성 타입
│   ├── utils/               # 도메인 지식이 없는 공통 헬퍼 함수
│   └── screens/             # 화면별 UI와 해당 화면에서 사용하는 코드
│       └── {screen}/
│           ├── components/  # 해당 화면에서만 사용하는 UI
│           ├── hooks/       # 해당 화면에서만 사용하는 훅
│           ├── api/         # 해당 화면에서 사용하는 데이터 요청 함수
│           ├── queries/     # 해당 화면의 조회 쿼리
│           ├── mutations/   # 해당 화면의 변경 뮤테이션
│           ├── domain/      # UI와 외부 의존성이 없는 비즈니스 로직
│           ├── types/       # 해당 화면에서만 사용하는 타입
│           ├── utils/       # 해당 화면에서만 사용하는 헬퍼 함수
│           ├── constants/   # 해당 화면에서만 사용하는 상수
│           └── {Name}Screen.tsx
└── supabase/                # Supabase CLI 설정과 DB 마이그레이션
    └── migrations/
```

위 구조는 파일 배치 기준이며, 아직 생성하지 않은 폴더도 포함합니다. 화면마다 하위 폴더를 모두 만들지 않습니다. 필요한 파일이 생길 때 해당 폴더를 추가합니다.

## 5. 문서 변경

새로운 기준이 필요하거나 기존 구조가 더 이상 적합하지 않다면 팀원과 논의한 후 이 문서를 함께 수정합니다.
