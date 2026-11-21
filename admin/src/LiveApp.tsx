import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import { consoleQuery, reportRow, type AdminIdentity, type ReportPage } from "./api/moderation";
import { AdminBrand } from "./components/AdminBrand";
import { AdminBtn } from "./components/AdminBtn";
import type { ReportFilter } from "./components/FilterTab";
import { useAdminQuery } from "./hooks/useAdminQuery";
import { AdminApiError, adminEnvironment, errorMessage, supabase } from "./lib/supabase";
import {
  LoginScreen,
  INVALID_CREDENTIALS_MESSAGE,
  type LoginCredentials,
} from "./screens/auth/LoginScreen";
import { LiveOperationsScreen } from "./screens/operations/LiveOperationsScreen";
import type { ContentTypeFilter } from "./screens/reports/components/ContentTypeSelect";
import { LiveReportDetailScreen } from "./screens/reports/LiveReportDetailScreen";
import { ReportListScreen } from "./screens/reports/ReportListScreen";
import "./live.css";

const EMPTY_COUNTS = { all: 0, received: 0, reviewing: 0, resolved: 0, rejected: 0 };

export function LiveApp({ route }: { route: string }) {
  const [session, setSession] = useState<Session | null>();
  const [identity, setIdentity] = useState<AdminIdentity>();
  const [accessError, setAccessError] = useState<unknown>();
  const [retry, setRetry] = useState(0);
  const currentUserId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!supabase) return;
    // 콜백 안에서는 Auth API를 다시 기다리지 않는다.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (currentUserId.current !== next?.user.id) {
        currentUserId.current = next?.user.id;
        setIdentity(undefined);
        setAccessError(undefined);
      }
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    consoleQuery<AdminIdentity>("session", {}, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setIdentity(data);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setAccessError(error);
      },
    );
    return () => controller.abort();
  }, [userId, retry]);
  useEffect(() => {
    const lost = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; status: number }>).detail;
      if (detail.userId === currentUserId.current) {
        setIdentity(undefined);
        setAccessError(
          new AdminApiError(
            detail.status === 403 ? "admin_required" : "not_authenticated",
            detail.status,
          ),
        );
      }
    };
    window.addEventListener("admin-access-lost", lost);
    return () => window.removeEventListener("admin-access-lost", lost);
  }, [userId]);
  async function login(credentials: LoginCredentials) {
    const { error } = await supabase!.auth.signInWithPassword(credentials);
    if (error)
      return {
        error:
          error.code === "invalid_credentials"
            ? INVALID_CREDENTIALS_MESSAGE
            : "로그인하지 못했습니다. 계정과 연결 상태를 확인해 주세요.",
      };
    window.location.hash = "/reports";
    return {};
  }
  async function logout() {
    const { error } = await supabase!.auth.signOut({ scope: "local" });
    if (error) throw error;
    setIdentity(undefined);
    window.location.hash = "/login";
  }
  if (!supabase)
    return (
      <main className="auth-screen">
        <section className="login-card">
          <AdminBrand />
          <h1>관리자 연결 설정이 필요합니다.</h1>
          <p>
            admin/.env.local에 Supabase URL과 공개 키, 환경 이름을 설정해 주세요. 설정 방법은
            admin/README.md에 있습니다.
          </p>
          <a href="#/designs">디자인 미리보기</a>
        </section>
      </main>
    );
  if (session === undefined)
    return (
      <main className="auth-screen" role="status">
        로그인 확인 중…
      </main>
    );
  if (!session) return <LoginScreen onLogin={login} hasLoginNotice={route !== "/login"} />;
  if (accessError)
    return (
      <main className="auth-screen">
        <section className="login-card">
          <h1>관리자 접근 확인</h1>
          <p role="alert">{errorMessage(accessError)}</p>
          <AdminBtn
            onClick={() => {
              setAccessError(undefined);
              setIdentity(undefined);
              setRetry((value) => value + 1);
            }}
          >
            다시 확인
          </AdminBtn>
          <AdminBtn variant="outline" onClick={() => void logout().catch(setAccessError)}>
            로그아웃
          </AdminBtn>
        </section>
      </main>
    );
  if (!identity || identity.id !== session.user.id)
    return (
      <main className="auth-screen" role="status">
        관리자 권한 확인 중…
      </main>
    );
  return (
    <>
      <div
        className={`admin-environment ${adminEnvironment === "production" ? "admin-environment--production" : ""}`}
      >
        {adminEnvironment === "review"
          ? "로컬 검증 · 예시 데이터"
          : adminEnvironment === "production"
            ? "운영 환경"
            : "개발·테스트 환경"}{" "}
        · {new URL(import.meta.env.VITE_SUPABASE_URL).hostname}
      </div>
      <ProtectedPages key={identity.id} route={route} identity={identity} onLogout={logout} />
    </>
  );
}

function ProtectedPages({
  route,
  identity,
  onLogout,
}: {
  route: string;
  identity: AdminIdentity;
  onLogout: () => Promise<void>;
}) {
  if (route === "/members" || route === "/sanctions")
    return (
      <LiveOperationsScreen
        key={route}
        view={route === "/members" ? "members" : "sanctions"}
        email={identity.email}
        onLogout={onLogout}
      />
    );
  const detailId = /^\/reports\/([1-9][0-9]{0,18})$/.exec(route)?.[1];
  if (detailId)
    return (
      <LiveReportDetailScreen
        key={detailId}
        reportId={detailId}
        email={identity.email}
        onLogout={onLogout}
      />
    );
  if (route !== "/reports" && route !== "/login" && route !== "/")
    return (
      <main className="auth-screen">
        <h1>페이지를 찾을 수 없습니다.</h1>
        <a href="#/reports">신고 목록으로</a>
      </main>
    );
  return <LiveReports email={identity.email} onLogout={onLogout} />;
}

function LiveReports({ email, onLogout }: { email: string; onLogout: () => Promise<void> }) {
  const [filters, setFilters] = useState<{
    status: ReportFilter;
    type: ContentTypeFilter;
    query: string;
    page: number;
  }>({ status: "all", type: "all", query: "", page: 1 });
  const query = useAdminQuery<ReportPage>("reports", filters);
  return (
    <ReportListScreen
      reports={(query.data?.rows ?? []).map(reportRow)}
      email={email}
      reportsHref="#/reports"
      onLogout={onLogout}
      onRefresh={async () => query.refresh()}
      onOpenReport={(id) => {
        window.location.hash = `/reports/${id}`;
      }}
      remote={{
        ...filters,
        counts: query.data?.counts ?? EMPTY_COUNTS,
        total: query.data?.total ?? 0,
        isLoading: query.isLoading,
        error: query.error,
        onRetry: query.refresh,
        onPage: (page) => setFilters((value) => ({ ...value, page })),
        onFilter: (filter) => setFilters((value) => ({ ...value, ...filter, page: 1 })),
      }}
    />
  );
}
