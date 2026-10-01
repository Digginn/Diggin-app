import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

const URL_PATTERN = /^https?:\/\/\S+$/i;

// iOS 는 클립보드를 읽으면 붙여넣기 허용 경고를 띄워서, 감지와 읽기를 나눔
export function useDetectedLink() {
  const [hasLink, setHasLink] = useState(false);
  const dismissedRef = useRef(false);

  const check = useCallback(async () => {
    if (dismissedRef.current) return;
    // hasUrlAsync 는 평문 링크를 false 로 봐서 내용 유무만 확인함
    setHasLink(await Clipboard.hasStringAsync());
  }, []);

  useEffect(() => {
    // 붙여넣기 허용 경고는 inactive 라 복귀로 세면 모달이 두 번 뜸
    let wasBackground = AppState.currentState === "background";

    const appState = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background") {
        wasBackground = true;
        return;
      }
      if (state !== "active" || !wasBackground) return;
      wasBackground = false;
      // iOS 는 백그라운드에서 클립보드 변경 알림을 안 줘서 복귀 때 다시 확인함
      dismissedRef.current = false;
      void check();
    });

    const clipboard = Clipboard.addClipboardListener(() => {
      dismissedRef.current = false;
      void check();
    });

    void Promise.resolve().then(() => check());

    return () => {
      appState.remove();
      Clipboard.removeClipboardListener(clipboard);
    };
  }, [check]);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setHasLink(false);
  }, []);

  // 불러오기를 눌렀을 때만 읽음. 여기서 붙여넣기 허용 경고가 뜸
  const read = useCallback(async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    dismissedRef.current = true;
    setHasLink(false);
    return URL_PATTERN.test(text) ? text : null;
  }, []);

  return { hasLink, dismiss, read };
}
