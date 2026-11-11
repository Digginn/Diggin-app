import { useFocusEffect, useIsFocused, useLocalSearchParams } from "expo-router";
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
  // 서버 기록을 확인한 안내와 그 결과. 확인 전에는 null이다.
  const [checked, setChecked] = useState<{ key: string; isVisible: boolean } | null>(null);
  const isFocused = useIsFocused();
  const { guide } = useLocalSearchParams<{ guide?: string }>();
  const isPreview = __DEV__ && guide === kind;
  const guideKey = isPreview ? `preview:${kind}` : userId ? `${userId}:${kind}` : null;

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      if (isEnabled && isPreview && guideKey) {
        setChecked({ key: guideKey, isVisible: true });
      } else if (isEnabled && userId && guideKey && !DISMISSED_GUIDES.has(guideKey)) {
        fetchDismissedFirstVisitGuides(userId)
          .then((kinds) => {
            if (!isActive) return;
            for (const dismissedKind of kinds) DISMISSED_GUIDES.add(`${userId}:${dismissedKind}`);
            setChecked({ key: guideKey, isVisible: !kinds.includes(kind) });
          })
          // 오프라인 등으로 기록을 못 읽으면 이미 본 안내일 수 있어 띄우지 않고 다음 진입 때 다시 확인한다(BUG-116·117).
          .catch(() => {
            if (isActive) setChecked({ key: guideKey, isVisible: false });
          });
      }
      return () => {
        isActive = false;
        setChecked(null);
      };
    }, [isEnabled, isPreview, kind, guideKey, userId]),
  );

  function dismiss() {
    setChecked(null);
    if (isPreview || !userId || !guideKey) return;
    DISMISSED_GUIDES.add(guideKey);
    void dismissFirstVisitGuide(userId, kind).catch(() => {});
  }

  const isVisible = isEnabled && guideKey !== null && checked?.key === guideKey && checked.isVisible;
  // 안내를 띄울지 확인하는 중이거나 떠 있는 동안. 이때 다른 모달이 먼저 뜨면 iOS가 안내를 띄우지 못한다.
  const isPending =
    isVisible ||
    (isFocused &&
      isEnabled &&
      !isPreview &&
      guideKey !== null &&
      !DISMISSED_GUIDES.has(guideKey) &&
      checked?.key !== guideKey);

  return { isVisible, isPending, dismiss };
}
