import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

// 제목과 링크를 같이 복사하는 앱이 많아 전체 일치가 아니라 첫 링크를 뽑음
const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

export function useDetectedLink() {
  const [link, setLink] = useState<string | null>(null);
  const handledRef = useRef(new Set<string>());
  const deniedRef = useRef(false);
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (deniedRef.current || checkingRef.current) return;
    checkingRef.current = true;
    try {
      if (!(await Clipboard.hasStringAsync())) return;

      const text = await Clipboard.getStringAsync();
      if (!text) {
        // 내용이 있다는데 빈 값이면 붙여넣기를 거부한 것임
        deniedRef.current = true;
        return;
      }

      const url = URL_PATTERN.exec(text)?.[0];
      if (!url || handledRef.current.has(url)) return;

      setLink(url);
    } catch {
      deniedRef.current = true;
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const handle = useCallback((url: string) => {
    handledRef.current.add(url);
    setLink(null);
  }, []);

  useEffect(() => {
    // 붙여넣기 허용 경고는 inactive 라 복귀로 세면 모달이 두 번 뜸
    let wasBackground = AppState.currentState !== "active";

    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background") {
        wasBackground = true;
        return;
      }
      if (state !== "active" || !wasBackground) return;
      wasBackground = false;
      deniedRef.current = false;
      void check();
    });

    void Promise.resolve().then(() => check());

    return () => subscription.remove();
  }, [check]);

  return { link, handle };
}
