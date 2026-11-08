import { useCallback, useState } from "react";
import { Platform } from "react-native";

/**
 * 붙여넣기 설정 안내를 띄운다.
 *
 * iOS 는 클립보드를 읽을 때마다 시스템 팝업이 뜨는데, 설정에서 '허용'으로 바꾸면 다시 묻지 않는다.
 * 그 경로를 알려주는 안내라 팝업을 거쳤거나 붙여넣기가 막혔을 때 띄운다. '허용'이면 뜨지 않는다. 안드로이드는 이 팝업 자체가 없다.
 * '다음에 하기'로 닫아도 다음 불러오기에서 조건이 다시 켜지면 또 띄운다.
 */
export function usePasteGuide(needsPasteGuide: boolean) {
  const [isDismissed, setDismissed] = useState(false);
  const [previous, setPrevious] = useState(needsPasteGuide);
  // 조건이 꺼졌다 다시 켜지면(다음 불러오기) 닫은 기록을 지운다.
  if (previous !== needsPasteGuide) {
    setPrevious(needsPasteGuide);
    if (!needsPasteGuide) setDismissed(false);
  }

  const dismiss = useCallback(() => setDismissed(true), []);

  return { isVisible: Platform.OS === "ios" && needsPasteGuide && !isDismissed, dismiss };
}
