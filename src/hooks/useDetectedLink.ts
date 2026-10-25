import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { isLinkDetectionPaused } from "@/hooks/useLinkDetectionPause";
import { isNativeModalBusy } from "@/hooks/useNativeModalVisible";
import { findItemLink } from "@/utils/itemLink";

import { DigginPasteboard } from "../../modules/diggin-pasteboard";

// 불러오기를 시작했거나 감지 모달에서 답한 링크. 같은 앱 실행 동안 다시 묻지 않는다.
const handledLinks = new Set<string>();
// iOS는 내용을 읽지 않고 복사 횟수로 같은 복사를 가린다. 답한 복사는 다시 묻지 않는다.
let handledChangeCount: number | null = null;

export function markLinkHandled(url: string) {
  handledLinks.add(url);
  if (DigginPasteboard) handledChangeCount = DigginPasteboard.getChangeCount();
}

/** url이 null이면 iOS에서 아직 읽지 않은 링크다. 불러오기를 누를 때 읽는다. */
type DetectedLink = { url: string | null; changeCount: number | null };

export function useDetectedLink() {
  const [detected, setDetected] = useState<DetectedLink | null>(null);
  // 클립보드를 읽는 순간이 iOS 시스템 팝업이 뜨는 순간이다.
  const [hasReadClipboard, setHasReadClipboard] = useState(false);
  const deniedRef = useRef(false);
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (deniedRef.current || checkingRef.current) return;
    // 시트·모달 위에는 감지 모달이 뜨지 못해 화면이 막힌다. 다음 복귀 때 다시 본다.
    if (isLinkDetectionPaused() || isNativeModalBusy()) return;
    checkingRef.current = true;
    try {
      // SAVE-017 iOS는 링크가 있는지만 팝업 없이 보고, 내용은 불러오기를 누른 뒤에 읽는다.
      if (DigginPasteboard) {
        const changeCount = DigginPasteboard.getChangeCount();
        if (changeCount === handledChangeCount) return;
        if (!(await DigginPasteboard.hasWebUrlAsync())) return;
        const preview = await DigginPasteboard.detectWebUrlAsync().catch(() => null);
        // https가 아니면 묻지 않는다.
        if (preview !== null && !findItemLink(preview)) {
          handledChangeCount = changeCount;
          return;
        }
        if (isLinkDetectionPaused() || isNativeModalBusy()) return;
        setDetected({ url: null, changeCount });
        return;
      }

      if (!(await Clipboard.hasStringAsync())) return;
      const text = await Clipboard.getStringAsync();
      if (!text) {
        // 내용이 있다는데 빈 값이면 붙여넣기를 거부한 것임
        deniedRef.current = true;
        setHasReadClipboard(true);
        return;
      }
      const url = findItemLink(text);
      // https 링크가 없으면 불러올 것도 없으니 붙여넣기 안내도 띄우지 않는다.
      if (!url) return;
      setHasReadClipboard(true);
      if (handledLinks.has(url) || isLinkDetectionPaused() || isNativeModalBusy()) return;
      setDetected({ url, changeCount: null });
    } catch {
      deniedRef.current = true;
    } finally {
      checkingRef.current = false;
    }
  }, []);

  /** 감지한 링크를 돌려준다. iOS는 이때 클립보드를 읽어 붙여넣기 허용 팝업이 뜬다. */
  const readLink = useCallback(async () => {
    if (!detected) return null;
    if (detected.url) return detected.url;
    try {
      const text = await Clipboard.getStringAsync();
      // 빈 값이면 붙여넣기를 거부한 것이다. 안내(다음부터 바로 불러오기)를 띄울 수 있게 남긴다.
      setHasReadClipboard(true);
      return text ? findItemLink(text) : null;
    } catch {
      setHasReadClipboard(true);
      return null;
    }
  }, [detected]);

  const handle = useCallback(
    (url: string | null) => {
      if (url) handledLinks.add(url);
      if (detected?.changeCount != null) handledChangeCount = detected.changeCount;
      setDetected(null);
    },
    [detected],
  );

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

  return { isDetected: detected !== null, readLink, handle, hasReadClipboard };
}
