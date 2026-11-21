import { fetchAnalyticsConsent, saveAnalyticsConsent } from "@/api/analyticsConsent";
import { applyAnalyticsConsent, type AnalyticsConsent } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";

/**
 * 로그인 이용약관 동의 시트의 선택 동의를 저장하고 바로 Amplitude 전송에 반영한다(#156).
 * 신규 회원은 체크하지 않은 항목도 미동의로 남긴다. 기존 회원은 체크한 항목만 더해, 다시 로그인하면서
 * 체크하지 않았다고 MY에서 한 동의가 철회되지 않게 한다. 철회는 MY와 이메일 요청으로만 한다.
 */
export async function saveLoginAnalyticsConsent(isNewUser: boolean, checked: AnalyticsConsent) {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;
  if (isNewUser) {
    applyAnalyticsConsent(userId, await saveAnalyticsConsent(checked, "signup"));
    return;
  }
  const current = await fetchAnalyticsConsent();
  const merged = {
    usage_analysis: current.usage_analysis || checked.usage_analysis,
    overseas_transfer: current.overseas_transfer || checked.overseas_transfer,
  };
  const isChanged =
    merged.usage_analysis !== current.usage_analysis ||
    merged.overseas_transfer !== current.overseas_transfer;
  applyAnalyticsConsent(userId, isChanged ? await saveAnalyticsConsent(merged, "login") : current);
}
