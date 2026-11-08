import { useEffect } from "react";

let pauseCount = 0;
const resumeListeners = new Set<() => void>();

export const isLinkDetectionPaused = () => pauseCount > 0;

/** 다시 확인하도록 요청한 멈춤이 모두 풀렸을 때 부른다. */
export function onLinkDetectionResume(listener: () => void) {
  resumeListeners.add(listener);
  return () => {
    resumeListeners.delete(listener);
  };
}

/**
 * 링크를 직접 넣는 시트가 떠 있는 동안 클립보드 감지 모달을 띄우지 않는다.
 * 시트 위에 감지 모달을 띄우면 iOS가 무시하고 투명한 창만 남아 화면 전체가 눌리지 않는다.
 */
export function useLinkDetectionPause(isPaused: boolean, shouldRecheckOnResume = false) {
  useEffect(() => {
    if (!isPaused) return;
    pauseCount += 1;
    return () => {
      pauseCount -= 1;
      // 첫 진입 안내처럼 탭에 들어오자마자 막은 경우는 앱 복귀를 기다리지 않고 풀리자마자 다시 본다.
      if (shouldRecheckOnResume && pauseCount === 0) resumeListeners.forEach((listener) => listener());
    };
  }, [isPaused, shouldRecheckOnResume]);
}
