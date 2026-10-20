import { useEffect } from "react";

let pauseCount = 0;

export const isLinkDetectionPaused = () => pauseCount > 0;

/**
 * 링크를 직접 넣는 시트가 떠 있는 동안 클립보드 감지 모달을 띄우지 않는다.
 * 시트 위에 감지 모달을 띄우면 iOS가 무시하고 투명한 창만 남아 화면 전체가 눌리지 않는다.
 */
export function useLinkDetectionPause(isPaused: boolean) {
  useEffect(() => {
    if (!isPaused) return;
    pauseCount += 1;
    return () => {
      pauseCount -= 1;
    };
  }, [isPaused]);
}
