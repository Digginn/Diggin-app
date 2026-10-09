import { useCallback, useState } from "react";
import { Platform } from "react-native";

import type { ItemSaveValues } from "./components/ItemSaveSheet";
import { fetchItemPreview } from "./fetchItemPreview";

export const EMPTY_ITEM_SAVE_VALUES: ItemSaveValues = {
  name: "",
  brand: "",
  price: "",
  sourceUrl: "",
  thumbnailUrl: null,
  wishLevel: null,
};

type Loaded = { values: ItemSaveValues; hasFailed: boolean };

/**
 * 링크를 받아 아이템 정보를 불러오고 저장 시트를 띄운다. ALL 탭의 아이템 추가와 클립보드
 * 감지가 같은 흐름을 쓴다.
 *
 * iOS 는 모달이 닫히는 중에 다른 모달을 띄우면 무시한다. 로딩과 시트가 둘 다 모달이라
 * 로딩이 완전히 닫힌 뒤에 시트를 연다.
 */
export function useItemSave() {
  const [isLoading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // 로딩이 닫히기를 기다리는 결과. 닫히면 loaded 로 올라가 시트가 열린다.
  const [waiting, setWaiting] = useState<Loaded | null>(null);

  const start = useCallback(async (sourceUrl: string) => {
    setLoading(true);
    const preview = await fetchItemPreview(sourceUrl);
    // 못 불러오면 링크만 남기고 사용자가 직접 채우게 한다.
    const next: Loaded = {
      values: preview ?? { ...EMPTY_ITEM_SAVE_VALUES, sourceUrl },
      hasFailed: preview === null,
    };
    setLoading(false);
    if (Platform.OS === "ios") setWaiting(next);
    else setLoaded(next);
  }, []);

  // 로딩 다이얼로그가 완전히 닫힌 뒤에 시트를 연다.
  const openAfterLoading = useCallback(() => {
    setWaiting((pending) => {
      if (pending) setLoaded(pending);
      return null;
    });
  }, []);

  const close = useCallback(() => setLoaded(null), []);

  return {
    isLoading,
    values: loaded?.values ?? null,
    hasFailed: loaded?.hasFailed ?? false,
    // 불러오는 중과 시트가 뜨기 직전에도 다른 창이 끼어들면 안 된다.
    isBusy: isLoading || waiting !== null || loaded !== null,
    start,
    openAfterLoading,
    close,
  };
}
