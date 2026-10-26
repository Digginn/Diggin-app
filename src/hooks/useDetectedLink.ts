import AsyncStorage from "@react-native-async-storage/async-storage";
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
// 복사 횟수는 앱을 다시 켜도 유지돼 기기에 저장한다. 재부팅하면 처음부터 다시 센다.
// '허용'이면 수십 ms 안에 읽힌다. 사람이 팝업에 답하려면 이보다 오래 걸린다.
const PASTE_PROMPT_MIN_MS = 300;
const HANDLED_CHANGE_COUNT_KEY = "link-detection-handled-change-count";
let handledChangeCount: number | null = null;
let handledChangeCountLoad: Promise<void> | null = null;

function loadHandledChangeCount() {
  handledChangeCountLoad ??= AsyncStorage.getItem(HANDLED_CHANGE_COUNT_KEY)
    .then((value) => {
      if (value !== null && handledChangeCount === null) handledChangeCount = Number(value);
    })
    .catch(() => {});
  return handledChangeCountLoad;
}

function saveHandledChangeCount(changeCount: number) {
  handledChangeCount = changeCount;
  void AsyncStorage.setItem(HANDLED_CHANGE_COUNT_KEY, String(changeCount)).catch(() => {});
}

export function markLinkHandled(url: string) {
  handledLinks.add(url);
  if (DigginPasteboard) saveHandledChangeCount(DigginPasteboard.getChangeCount());
}

/** url이 null이면 iOS에서 아직 읽지 않은 링크다. 불러오기를 누를 때 읽는다. */
type DetectedLink = { url: string | null; changeCount: number | null };

export function useDetectedLink() {
  const [detected, setDetected] = useState<DetectedLink | null>(null);
  // '허용' 설정이 아니어서 팝업을 거쳤거나 막힌 경우에 켠다. '허용'이면 바로 읽혀 안내가 뜨지 않는다.
  const [needsPasteGuide, setNeedsPasteGuide] = useState(false);
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
        await loadHandledChangeCount();
        const changeCount = DigginPasteboard.getChangeCount();
        if (changeCount === handledChangeCount) return;
        // 값을 돌려주는 detectValues는 클립보드를 읽은 것으로 쳐 팝업이 먼저 뜬다(BUG-058). 링크 유무만 본다.
        if (!(await DigginPasteboard.hasWebUrlAsync())) return;
        if (isLinkDetectionPaused() || isNativeModalBusy()) return;
        setDetected({ url: null, changeCount });
        return;
      }

      if (!(await Clipboard.hasStringAsync())) return;
      const text = await Clipboard.getStringAsync();
      if (!text) {
        // 내용이 있다는데 빈 값이면 붙여넣기를 거부한 것임
        deniedRef.current = true;
        setNeedsPasteGuide(true);
        return;
      }
      const url = findItemLink(text);
      // https 링크가 없으면 불러올 것도 없으니 붙여넣기 안내도 띄우지 않는다.
      if (!url) return;
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
      // 붙여넣기 설정이 '묻기'면 메인 스레드에서 읽어야 사용자의 답을 기다린다(BUG-058). 모듈이 없는 빌드는 expo-clipboard로 읽는다.
      // URL 형식으로만 복사되면 문자열이 비어 있어 URL로 한 번 더 읽는다.
      const startedAt = Date.now();
      const text = DigginPasteboard?.readLinkTextAsync
        ? await DigginPasteboard.readLinkTextAsync()
        : (await Clipboard.getStringAsync()) || (await Clipboard.getUrlAsync());
      // 빈 값이면 막힌 것이고, 오래 걸렸으면 '묻기' 팝업에 사용자가 답한 것이다. 둘 다 안내(다음부터 바로 불러오기)를 띄운다.
      // shortcut: 설정값을 읽는 API가 없어 읽기 시간으로 팝업 여부를 가린다. iOS가 설정 조회 API를 주면 그걸로 바꾼다.
      if (!text || Date.now() - startedAt >= PASTE_PROMPT_MIN_MS) setNeedsPasteGuide(true);
      return text ? findItemLink(text) : null;
    } catch {
      setNeedsPasteGuide(true);
      return null;
    }
  }, [detected]);

  const handle = useCallback(
    (url: string | null) => {
      if (url) handledLinks.add(url);
      if (detected?.changeCount != null) saveHandledChangeCount(detected.changeCount);
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

  // 링크를 못 읽어 닫을 때는 처리 기록을 남기지 않는다. 설정에서 허용하고 돌아오면 같은 링크를 다시 묻는다.
  const close = useCallback(() => setDetected(null), []);

  return { isDetected: detected !== null, readLink, handle, close, needsPasteGuide };
}
