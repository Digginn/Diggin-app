import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";

export type FirstVisitGuideKind = "all" | "folder" | "item-detail";

// 저장 실패 시에도 현재 앱 실행 중에는 다시 보여주지 않습니다.
const DISMISSED_GUIDES = new Set<FirstVisitGuideKind>();

export function useFirstVisitGuide(kind: FirstVisitGuideKind, isEnabled = true) {
  const [isVisible, setIsVisible] = useState(false);
  const storageKey = `first-visit-guide:${kind}`;
  const { guide } = useLocalSearchParams<{ guide?: string }>();
  const isPreview = __DEV__ && guide === kind;

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      if (isEnabled && isPreview) {
        setIsVisible(true);
      } else if (isEnabled && !DISMISSED_GUIDES.has(kind)) {
        AsyncStorage.getItem(storageKey)
          .then((value) => {
            if (isActive) setIsVisible(value !== "dismissed");
          })
          .catch(() => {
            if (isActive) setIsVisible(true);
          });
      }
      return () => {
        isActive = false;
        setIsVisible(false);
      };
    }, [isEnabled, isPreview, kind, storageKey]),
  );

  function dismiss() {
    setIsVisible(false);
    if (isPreview) return;
    DISMISSED_GUIDES.add(kind);
    AsyncStorage.setItem(storageKey, "dismissed").catch(() => {});
  }

  return { isVisible, dismiss };
}
