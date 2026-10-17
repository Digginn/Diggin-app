import { useEffect, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";

// iOS는 다른 모달이 닫히는 중에 띄운 모달을 무시한다. RN은 떠 있다고 보고 투명한 창이 터치를 막는다.
// shortcut: 닫힘 애니메이션을 고정 시간만큼 기다린다. 모든 모달에서 닫힘 완료 시점을 받게 되면 그 시점으로 바꾼다.
const DISMISS_MS = 400;

let dismissingCount = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isOtherModalDismissing() {
  return dismissingCount > 0;
}

function markDismissing() {
  dismissingCount += 1;
  notify();
  setTimeout(() => {
    dismissingCount -= 1;
    notify();
  }, DISMISS_MS);
}

/** RN Modal의 visible에 넘길 값. 다른 모달이 닫히는 중이면 다 닫힐 때까지 띄우지 않는다. */
export function useNativeModalVisible(visible: boolean) {
  const isDismissing = useSyncExternalStore(subscribe, isOtherModalDismissing);
  const [isShown, setIsShown] = useState(false);
  // 이미 떠 있으면 다른 모달이 닫히는 중이어도 그대로 둔다.
  if (!visible && isShown) setIsShown(false);
  if (visible && !isShown && (Platform.OS !== "ios" || !isDismissing)) setIsShown(true);

  useEffect(() => {
    if (!isShown) return;
    return markDismissing;
  }, [isShown]);

  return isShown;
}
