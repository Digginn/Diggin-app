import type { AnalyticsConsent } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";

export const analyticsConsentKeys = {
  detail: (viewer: string | null) => ["analytics-consent", viewer] as const,
};

function toConsent(data: unknown): AnalyticsConsent {
  const value = data as Partial<AnalyticsConsent> | null;
  if (typeof value?.usage_analysis !== "boolean" || typeof value?.overseas_transfer !== "boolean") {
    throw new Error("invalid_analytics_consent_response");
  }
  return { usage_analysis: value.usage_analysis, overseas_transfer: value.overseas_transfer };
}

/** MY-017 이용 기록 분석·국외 이전 선택 동의. 기록이 없으면 미동의다. */
export async function fetchAnalyticsConsent() {
  const { data, error } = await supabase.rpc("get_analytics_consent");
  if (error) throw error;
  return toConsent(data);
}

/** 두 항목을 함께 보내 저장 후 상태를 돌려받는다. source는 동의 이력의 출처다. */
export async function saveAnalyticsConsent(
  consent: AnalyticsConsent,
  source: "signup" | "login" | "settings",
) {
  const { data, error } = await supabase.rpc("set_analytics_consent", {
    usage_analysis: consent.usage_analysis,
    overseas_transfer: consent.overseas_transfer,
    consent_source: source,
  });
  if (error) throw error;
  return toConsent(data);
}
