import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  analyticsConsentKeys,
  fetchAnalyticsConsent,
  saveAnalyticsConsent,
} from "@/api/analyticsConsent";
import { ConsentBar } from "@/components/ConsentBar";
import { TOAST_MESSAGES } from "@/constants/messages";
import { useToast } from "@/hooks/useToast";
import { applyAnalyticsConsent, type AnalyticsConsent } from "@/lib/analytics";

export const ANALYTICS_CONSENT_ITEMS = {
  "usage-analysis": {
    key: "usage_analysis",
    label: "(선택) 서비스 이용 기록 분석 동의",
    toast: TOAST_MESSAGES.MY_014,
  },
  "overseas-transfer": {
    key: "overseas_transfer",
    label: "(선택) 이용 기록의 국외 이전 동의",
    toast: TOAST_MESSAGES.MY_015,
  },
} as const;

/**
 * MY-017 선택 동의 체크박스. 두 항목은 따로 바뀌고, 체크할 때만 Toast를 띄운다.
 * 저장에 성공하면 바로 Amplitude 전송을 켜거나 멈춘다. 실패하면 이전 상태를 그대로 보여 준다.
 */
export function AnalyticsConsentBar({
  document,
  userId,
}: {
  document: keyof typeof ANALYTICS_CONSENT_ITEMS;
  userId: string;
}) {
  const item = ANALYTICS_CONSENT_ITEMS[document];
  const showToast = useToast();
  const queryClient = useQueryClient();
  const consent = useQuery({
    queryKey: analyticsConsentKeys.detail(userId),
    queryFn: fetchAnalyticsConsent,
  });
  const save = useMutation({
    mutationFn: (next: AnalyticsConsent) => saveAnalyticsConsent(next, "settings"),
    onSuccess: (saved, requested) => {
      queryClient.setQueryData(analyticsConsentKeys.detail(userId), saved);
      applyAnalyticsConsent(userId, saved);
      if (requested[item.key]) showToast(item.toast);
    },
    onError: () => showToast(TOAST_MESSAGES.SYS_002),
  });
  const isChecked = consent.data?.[item.key] ?? false;

  return (
    <ConsentBar
      label={item.label}
      state={isChecked ? "on" : "off"}
      isBusy={save.isPending || consent.isPending}
      onPress={() => {
        if (!consent.data) {
          showToast(TOAST_MESSAGES.SYS_002);
          void consent.refetch();
          return;
        }
        save.mutate({ ...consent.data, [item.key]: !isChecked });
      }}
    />
  );
}
