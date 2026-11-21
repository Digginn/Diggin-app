import { useCallback, useState, useSyncExternalStore } from "react";

import { ComponentPreview } from "./ComponentPreview";
import { AdminBrand } from "./components/AdminBrand";
import { AdminToast } from "./components/AdminToast";
import { LiveApp } from "./LiveApp";
import { OPERATIONS_DESIGN_STATES } from "./preview-data/operations";
import { DETAIL_DESIGN_STATES, DETAIL_EXAMPLES } from "./preview-data/report-details";
import { REPORT_ACTION_DESIGN_STATES, REPORT_DESIGN_STATES } from "./preview-data/report-states";
import { PREVIEW_REPORTS } from "./preview-data/reports";
import {
  INVALID_CREDENTIALS_MESSAGE,
  LoginScreen,
  type LoginCredentials,
} from "./screens/auth/LoginScreen";
import { OperationsScreen } from "./screens/operations/OperationsScreen";
import { ReportDetailScreen } from "./screens/reports/ReportDetailScreen";
import { ReportListScreen } from "./screens/reports/ReportListScreen";

const EXAMPLE_EMAIL = "diggin.app@gmail.com";
const EXAMPLE_PASSWORD = "preview123";
const DESIGN_STATES = [
  {
    path: "login",
    title: "로그인",
    node: "7068:144804",
    description: "빈 입력란과 비활성 로그인 버튼",
  },
  {
    path: "login-filled",
    title: "로그인 · 입력 완료",
    node: "7068:144825",
    description: "입력값과 활성 로그인 버튼",
  },
  {
    path: "login-error",
    title: "로그인 · 오류",
    node: "7068:144846",
    description: "자격 증명 오류와 재입력",
  },
  {
    path: "login-required",
    title: "비로그인 · 로그인 필요",
    node: "7068:144780",
    description: "보호 화면 진입 안내",
  },
  {
    path: "reports-profile",
    title: "신고 목록 · 프로필 메뉴",
    node: "7068:144892",
    description: "신고 목록과 운영자 메뉴",
  },
  {
    path: "logout-confirm",
    title: "로그아웃 · 확인 모달",
    node: "7068:144996",
    description: "취소·확인과 키보드 포커스",
  },
  {
    path: "logged-out",
    title: "로그아웃 · 완료",
    node: "7068:144868",
    description: "초기화된 로그인 화면과 완료 토스트",
  },
];

function subscribeRoute(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
function readRoute() {
  return window.location.hash.slice(1) || "/designs";
}
function navigate(route: string) {
  window.location.hash = route;
}

function DesignIndex() {
  return (
    <main className="design-index">
      <AdminBrand />
      <header>
        <p className="design-index__eyebrow">관리자 화면 미리보기</p>
        <h1>로그인 · 비로그인 · 로그아웃</h1>
        <p>Figma 화면의 입력과 전환 동작을 확인합니다. 모든 신고 내용은 예시입니다.</p>
      </header>
      <div className="design-index__notice">
        <strong>실제 계정과 연결되지 않은 미리보기입니다.</strong>
        <p>
          입력값은 서버로 전송하거나 저장하지 않습니다. 로그인 상태는 이 탭의 메모리에만 유지되며
          새로고침하면 초기화됩니다.
        </p>
      </div>
      <nav className="design-index__screens" aria-label="디자인 상태 선택">
        {DESIGN_STATES.map((state) => (
          <a href={`#/designs/${state.path}`} key={state.path}>
            <span>{state.title}</span>
            <p>{state.description}</p>
            <small>{state.node}</small>
          </a>
        ))}
      </nav>
      <section className="design-index__section" aria-labelledby="report-designs-title">
        <h2 className="design-section-heading" id="report-designs-title">
          신고 목록 · 상태 필터 · 유형 · 검색
        </h2>
        <p className="design-index__section-description">
          상태별 전체 건수는 유지하며, 필터·검색·유형 선택을 조합해 예시 목록을 확인합니다.
        </p>
        <nav className="design-index__screens" aria-label="신고 목록 디자인 상태 선택">
          {REPORT_DESIGN_STATES.map((state) => (
            <a href={`#/designs/${state.path}`} key={state.path}>
              <span>{state.title}</span>
              <small>{state.node}</small>
            </a>
          ))}
        </nav>
      </section>
      <section className="design-index__section" aria-labelledby="report-actions-title">
        <h2 className="design-section-heading" id="report-actions-title">
          조치 후 신고 목록 (처리 반영)
        </h2>
        <p className="design-index__section-description">
          각 콘텐츠를 처리 완료 또는 반려한 뒤의 상태와 집계를 확인합니다. 예시별 조치는
          독립적입니다.
        </p>
        <nav className="design-index__screens" aria-label="조치 후 신고 목록 디자인 상태 선택">
          {REPORT_ACTION_DESIGN_STATES.map((state) => (
            <a href={`#/designs/${state.path}`} key={state.path}>
              <span>{state.title}</span>
              <small>{state.node}</small>
            </a>
          ))}
        </nav>
      </section>
      {Object.entries(DETAIL_EXAMPLES).map(([content, example]) => (
        <section
          className="design-index__section"
          key={content}
          aria-labelledby={`detail-${content}-title`}
        >
          <h2 className="design-section-heading" id={`detail-${content}-title`}>
            {example.closed
              ? `${example.report.title} 상세 (처리 종료된 신고)`
              : `${example.report.title} 처리 흐름 · 상세 → 조치 입력 → 확인 모달 → 조치 완료`}
          </h2>
          <nav
            className="design-index__screens"
            aria-label={`${example.report.title} ${example.closed ? "종료된 신고 상세 선택" : "처리 흐름 선택"}`}
          >
            {DETAIL_DESIGN_STATES.filter((state) => state.content === content).map((state) => (
              <a key={state.path} href={`#/designs/${state.path}`}>
                <span>{state.title}</span>
                <small>{state.node}</small>
              </a>
            ))}
          </nav>
        </section>
      ))}
      <section className="design-index__section" aria-labelledby="operations-designs-title">
        <h2 className="design-section-heading" id="operations-designs-title">
          기타 메뉴 · 새로고침 토스트
        </h2>
        <p className="design-index__section-description">
          제재 이력·회원 목록의 독립 예시와 목록·상세 새로고침 안내를 확인합니다.
        </p>
        <nav className="design-index__screens" aria-label="기타 메뉴와 새로고침 디자인 상태 선택">
          {OPERATIONS_DESIGN_STATES.map((state) => (
            <a key={state.path} href={`#/designs/${state.path}`}>
              <span>{state.title}</span>
              <small>{state.node}</small>
            </a>
          ))}
        </nav>
      </section>
      <footer>
        <a href="#/preview/reports">비로그인 상태에서 보호 화면 진입</a>
        <a href="#/components">공통 컴포넌트 보기</a>
        <a
          href="https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N?node-id=7068-144779"
          target="_blank"
          rel="noreferrer"
        >
          Figma 원본
        </a>
      </footer>
    </main>
  );
}

function LoggedOutScreen({
  onLogin,
}: {
  onLogin: (credentials: LoginCredentials) => Promise<{ error?: never }>;
}) {
  const [isVisible, setIsVisible] = useState(true);
  const dismiss = useCallback(() => setIsVisible(false), []);
  return (
    <>
      <LoginScreen onLogin={onLogin} />
      <div className="auth-toast-position">
        <AdminToast message="로그아웃했어요." isVisible={isVisible} onDismiss={dismiss} />
      </div>
    </>
  );
}

export function App() {
  const route = useSyncExternalStore(
    subscribeRoute,
    () => window.location.hash.slice(1) || "/reports",
  );
  return route.startsWith("/designs") || route.startsWith("/preview") || route === "/components" ? (
    <DesignApp />
  ) : (
    <LiveApp route={route} />
  );
}

function DesignApp() {
  const route = useSyncExternalStore(subscribeRoute, readRoute);
  const [isPreviewSignedIn, setIsPreviewSignedIn] = useState(false);
  const [previewEmail, setPreviewEmail] = useState(EXAMPLE_EMAIL);
  const [reportPreview, setReportPreview] = useState(PREVIEW_REPORTS);
  const [toast, setToast] = useState({ id: 0, message: "", isVisible: false });
  const dismissToast = useCallback(
    () => setToast((current) => ({ ...current, isVisible: false })),
    [],
  );
  const showToast = (message: string) =>
    setToast((current) => ({ id: current.id + 1, message, isVisible: true }));

  // 화면 검증 전용 전환이다. 인증 토큰·비밀번호·세션을 생성하거나 저장하지 않는다.
  async function previewLogin({ email }: LoginCredentials): Promise<{ error?: never }> {
    setPreviewEmail(email);
    setIsPreviewSignedIn(true);
    navigate("/preview/reports");
    return {};
  }
  async function previewLogout() {
    setIsPreviewSignedIn(false);
    setPreviewEmail(EXAMPLE_EMAIL);
    setToast((current) => ({ ...current, isVisible: false }));
    navigate("/designs/logged-out");
  }

  if (route === "/components") return <ComponentPreview />;
  if (route === "/designs/logged-out")
    return <LoggedOutScreen key={route} onLogin={previewLogin} />;

  const isProtectedRoute = route.startsWith("/preview/");
  const operationsView = route.endsWith("/sanctions")
    ? "sanctions"
    : route.endsWith("/members")
      ? "members"
      : null;
  if (
    operationsView &&
    (route === `/designs/${operationsView}` || (isProtectedRoute && isPreviewSignedIn))
  ) {
    return (
      <OperationsScreen
        key={route}
        view={operationsView}
        email={previewEmail}
        isPreview={isProtectedRoute}
        onLogout={previewLogout}
      />
    );
  }
  const detailDesign =
    DETAIL_DESIGN_STATES.find((state) => route === `/designs/${state.path}`) ??
    (route === "/designs/detail-refresh"
      ? { content: "post-30" as const, step: "detail" as const }
      : undefined);
  if (detailDesign) {
    return (
      <ReportDetailScreen
        key={route}
        content={detailDesign.content}
        initialStep={detailDesign.step}
        initialRefreshToast={route === "/designs/detail-refresh"}
        email={previewEmail}
        onLogout={previewLogout}
        onBack={(status) => {
          const currentReport = DETAIL_EXAMPLES[detailDesign.content].report;
          setReportPreview(
            PREVIEW_REPORTS.map((report) =>
              report.type === currentReport.type && report.id === currentReport.id
                ? { ...report, status }
                : report,
            ),
          );
          navigate("/designs/reports-current");
        }}
      />
    );
  }
  const reportDesign = [...REPORT_DESIGN_STATES, ...REPORT_ACTION_DESIGN_STATES].find(
    (state) => route === `/designs/${state.path}`,
  );
  if (
    reportDesign ||
    route === "/designs/reports-refresh" ||
    route === "/designs/reports-current" ||
    route === "/designs/reports-profile" ||
    route === "/designs/logout-confirm" ||
    (isProtectedRoute && isPreviewSignedIn)
  ) {
    return (
      <>
        <ReportListScreen
          key={route}
          reports={
            route === "/designs/reports-current"
              ? reportPreview
              : (reportDesign?.reports ?? PREVIEW_REPORTS)
          }
          className={
            reportDesign?.reports || route === "/designs/reports-current"
              ? "report-screen--after-action"
              : ""
          }
          email={previewEmail}
          reportsHref={isProtectedRoute ? "#/preview/reports" : "#/designs/reports"}
          initialRefreshToast={route === "/designs/reports-refresh"}
          initialProfileOpen={route === "/designs/reports-profile"}
          initialLogoutOpen={route === "/designs/logout-confirm"}
          initialSelected={reportDesign?.selected}
          initialTypeFilter={reportDesign?.type}
          initialQuery={reportDesign?.query}
          initialTypeOpen={reportDesign?.isTypeOpen}
          onLogout={previewLogout}
          onRefresh={async () => {}}
          onOpenReport={(id) => {
            const detail = DETAIL_DESIGN_STATES.find(
              (state) =>
                (state.step === "detail" || state.step === "closed") &&
                DETAIL_EXAMPLES[state.content].report.id === id,
            );
            if (detail) {
              const reports =
                route === "/designs/reports-current"
                  ? reportPreview
                  : (reportDesign?.reports ?? PREVIEW_REPORTS);
              const status = reports.find((report) => report.id === id)?.status;
              const isComplete = status === "resolved" || status === "rejected";
              navigate(
                `/designs/${detail.path}${isComplete && detail.step !== "closed" ? "-complete" : ""}`,
              );
            } else showToast(`콘텐츠 #${id}을 선택했어요.`);
          }}
        />
        <div className="auth-toast-position">
          <AdminToast
            key={toast.id}
            message={toast.message}
            isVisible={toast.isVisible}
            onDismiss={dismissToast}
          />
        </div>
      </>
    );
  }
  if (route.startsWith("/designs/login") || isProtectedRoute) {
    const hasExample = route === "/designs/login-filled" || route === "/designs/login-error";
    return (
      <LoginScreen
        key={route}
        initialEmail={hasExample ? EXAMPLE_EMAIL : ""}
        initialPassword={hasExample ? EXAMPLE_PASSWORD : ""}
        initialError={route === "/designs/login-error" ? INVALID_CREDENTIALS_MESSAGE : ""}
        hasLoginNotice={route === "/designs/login-required" || isProtectedRoute}
        onLogin={
          route === "/designs/login-error"
            ? async () => ({ error: INVALID_CREDENTIALS_MESSAGE })
            : previewLogin
        }
      />
    );
  }
  return <DesignIndex />;
}
