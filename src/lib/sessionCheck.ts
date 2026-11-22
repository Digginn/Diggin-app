import { supabase } from "@/lib/supabase";

let pending: Promise<unknown> | null = null;

/**
 * AUTH-010 서버에서 세션이 지워져도 남은 access token은 최대 1시간 유효해 앱이 알아채지 못한다(BUG-126).
 * 끊긴 세션이면 SDK가 session_not_found를 받아 세션을 지우고 SIGNED_OUT을 보낸다. 네트워크 오류는 세션을 유지한다.
 */
export function checkSession() {
  pending ??= supabase.auth.getUser().finally(() => {
    pending = null;
  });
  return pending;
}
