import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";

import {
  dismissFirstVisitGuide,
  fetchDismissedFirstVisitGuides,
  type FirstVisitGuideKind,
} from "@/api/firstVisitGuides";
import { useAuth } from "@/contexts/AuthContext";

export type { FirstVisitGuideKind } from "@/api/firstVisitGuides";

// 저장 실패 시에도 현재 앱 실행 중에는 다시 보여주지 않습니다.
const DISMISSED_GUIDES = new Set<string>();

export function useFirstVisitGuide(kind: FirstVisitGuideKind, isEnabled = true) {
  const { session, isRestoring } = useAuth();
  const userId = isRestoring ? null : (session?.user.id ?? null);
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const { guide } = useLocalSearchParams<{ guide?: string }>();
  const isPreview = __DEV__ && guide === kind;
  const guideKey = isPreview ? `preview:${kind}` : userId ? `${userId}:${kind}` : null;

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      if (isEnabled && isPreview) {
        setVisibleKey(guideKey);
      } else if (isEnabled && userId && guideKey && !DISMISSED_GUIDES.has(guideKey)) {
        fetchDismissedFirstVisitGuides(userId)
          .then((kinds) => {
            if (!isActive) return;
            for (const dismissedKind of kinds) DISMISSED_GUIDES.add(`${userId}:${dismissedKind}`);
            setVisibleKey(kinds.includes(kind) ? null : guideKey);
          })
          .catch(() => {
            if (isActive) setVisibleKey(guideKey);
          });
      }
      return () => {
        isActive = false;
        setVisibleKey(null);
      };
    }, [isEnabled, isPreview, kind, guideKey, userId]),
  );

  function dismiss() {
    setVisibleKey(null);
    if (isPreview || !userId || !guideKey) return;
    DISMISSED_GUIDES.add(guideKey);
    void dismissFirstVisitGuide(userId, kind).catch(() => {});
  }

  return { isVisible: isEnabled && guideKey !== null && visibleKey === guideKey, dismiss };
}
