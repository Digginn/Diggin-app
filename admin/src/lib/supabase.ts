import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const adminEnvironment = import.meta.env.VITE_ADMIN_ENVIRONMENT || "미설정";
let isValidUrl = false;
try {
  const parsed = new URL(url ?? "");
  isValidUrl =
    !parsed.username &&
    !parsed.password &&
    parsed.pathname === "/" &&
    (parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname)));
} catch {
  /* 설정 안내 화면에서 복구한다. */
}
export const supabase =
  isValidUrl &&
  url &&
  key?.startsWith("sb_publishable_") &&
  ["development", "production", "review"].includes(adminEnvironment) &&
  (adminEnvironment !== "review" || url === "http://127.0.0.1:55421")
    ? createClient(url, key, {
        auth: {
          storageKey: `diggin-admin-auth-${new URL(url).hostname}`,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export class AdminApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(code);
  }
}

export async function adminRequest<T>(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (!supabase) throw new AdminApiError("configuration_required");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new AdminApiError("not_authenticated", 401);
  const session = data.session;
  const apiUrl =
    adminEnvironment === "review"
      ? "http://127.0.0.1:55425"
      : `${url}/functions/v1/admin-moderation`;
  const response = await fetch(apiUrl, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "apikey": key!,
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null);
    const code =
      result && typeof result === "object" && "error" in result && typeof result.error === "string"
        ? result.error
        : "request_failed";
    // 구버전 Edge는 유효한 새 세션 확인 요청도 알 수 없는 action으로 거부한다.
    if (
      body.action === "console" &&
      body.resource === "session" &&
      response.status === 400 &&
      code === "invalid_request"
    ) {
      throw new AdminApiError("admin_api_not_deployed", response.status);
    }
    if (response.status === 401 || response.status === 403) {
      window.dispatchEvent(
        new CustomEvent("admin-access-lost", {
          detail: { userId: session.user.id, status: response.status },
        }),
      );
    }
    throw new AdminApiError(code, response.status);
  }
  return response.json() as Promise<T>;
}

export function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.code === "pending_request_storage_unavailable")
      return "재시도 정보를 보관할 수 없습니다. 브라우저 저장소 설정을 확인한 뒤 다시 시도해 주세요.";
    if (error.code === "admin_api_not_deployed")
      return "관리자 서비스 배포가 아직 완료되지 않았습니다. 배포 완료 후 다시 확인해 주세요.";
    if (error.status === 401) return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
    if (error.status === 403) return "관리자 권한이 없습니다. 서비스 관리자에게 문의해 주세요.";
    if (error.code.includes("conflict") || error.code === "invalid_report_transition")
      return "다른 조치로 상태가 변경되었습니다. 최신 정보를 확인한 뒤 다시 시도해 주세요.";
    if (error.code.includes("pending"))
      return "이 계정의 다른 조치가 처리 중입니다. 잠시 후 다시 확인해 주세요.";
    if (error.code.includes("not_found"))
      return "대상을 찾을 수 없습니다. 삭제 여부를 확인해 주세요.";
    if (error.code === "cannot_sanction_admin") return "관리자 계정은 제재할 수 없습니다.";
    if (error.code.startsWith("invalid_")) return "입력값이나 현재 상태를 확인해 주세요.";
  }
  return "요청 결과를 확인하지 못했습니다. 연결 상태를 확인한 후 다시 시도해 주세요.";
}
