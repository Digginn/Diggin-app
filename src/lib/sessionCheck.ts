import { supabase } from "@/lib/supabase";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let pending: { token: string; promise: Promise<void> } | null = null;

/**
 * AUTH-010 서버에서 세션이 지워져도 남은 access token은 최대 1시간 유효해 앱이 알아채지 못한다(BUG-126).
 * SDK의 getUser()는 응답이 늦게 오면 그사이 로그인한 다른 계정의 세션까지 지워서 직접 확인한다.
 * 확인을 시작한 토큰이 아직 현재 세션일 때만 로그아웃해 SIGNED_OUT을 보낸다. 네트워크·서버 오류는 세션을 유지한다.
 */
export async function checkSession() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  if (pending?.token !== token) {
    const promise = verify(token).finally(() => {
      if (pending?.promise === promise) pending = null;
    });
    pending = { token, promise };
  }
  return pending.promise;
}

async function verify(token: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabasePublishableKey ?? "", Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!response || response.ok || response.status >= 500) return;
  // API 버전에 따라 오류 코드가 code 또는 error_code에 온다. 이전 형식의 code는 HTTP 상태 숫자다.
  const body = (await response.json().catch(() => null)) as {
    code?: unknown;
    error_code?: unknown;
  } | null;
  if (body?.code !== "session_not_found" && body?.error_code !== "session_not_found") return;
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token === token) await supabase.auth.signOut({ scope: "local" });
}
