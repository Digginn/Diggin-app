import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { AppState, Platform } from "react-native";

import { folderKeys } from "@/api/folders";
import { productKeys, saveProduct } from "@/api/products";
import { normalizeProductPage } from "@/screens/save/domain/normalizeProductPage";
import type { ProductPageRaw } from "@/screens/save/domain/productPageScript";
import type { ItemSaveValues } from "@/types/wish-item";

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
 * 감지가 같은 흐름을 쓴다. 정보는 readingUrl이 있는 동안 ItemSaveFlow가 숨긴 WebView로 읽어
 * finishReading으로 돌려준다(WebView는 화면에 그려져야 페이지를 열 수 있다).
 *
 * iOS 는 모달이 닫히는 중에 다른 모달을 띄우면 무시한다. 로딩과 시트가 둘 다 모달이라
 * 로딩이 완전히 닫힌 뒤에 시트를 연다.
 */
export function useItemSave() {
  const [isLoading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // 로딩이 닫히기를 기다리는 결과. 닫히면 loaded 로 올라가 시트가 열린다.
  const [waiting, setWaiting] = useState<Loaded | null>(null);

  const [readingUrl, setReadingUrl] = useState<string | null>(null);

  const start = useCallback((sourceUrl: string) => {
    setLoading(true);
    setReadingUrl(sourceUrl);
  }, []);

  const finishReading = useCallback(
    (raw: ProductPageRaw | null) => {
      if (readingUrl === null) return;
      // 페이지를 못 열면 링크만 남기고 사용자가 직접 채우게 한다(SAVE-007).
      const next: Loaded = raw
        ? normalizeProductPage(raw, readingUrl)
        : { values: { ...EMPTY_ITEM_SAVE_VALUES, sourceUrl: readingUrl }, hasFailed: true };
      setReadingUrl(null);
      setLoading(false);
      if (Platform.OS === "ios") setWaiting(next);
      else setLoaded(next);
    },
    [readingUrl],
  );

  // 로딩 다이얼로그가 완전히 닫힌 뒤에 시트를 연다.
  // 앱이 뒤에 가 있으면 iOS가 시트를 띄우지 않는데 RN은 떠 있다고 보고 투명한 창이 터치를 막는다. 앞으로 돌아오면 연다.
  const openAfterLoading = useCallback(() => {
    const open = () =>
      setWaiting((pending) => {
        if (pending) setLoaded(pending);
        return null;
      });
    if (AppState.currentState === "active") {
      open();
      return;
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      subscription.remove();
      open();
    });
  }, []);

  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (values: ItemSaveValues) => saveProduct(values),
    onSuccess: ({ isDuplicate }) => {
      if (isDuplicate) return;
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: folderKeys.all }),
      ]);
    },
  });

  const close = useCallback(() => {
    setLoaded(null);
    save.reset();
  }, [save]);

  return {
    isLoading,
    values: loaded?.values ?? null,
    hasFailed: loaded?.hasFailed ?? false,
    // 불러오는 중과 시트가 뜨기 직전에도 다른 창이 끼어들면 안 된다.
    isBusy: isLoading || waiting !== null || loaded !== null,
    start,
    readingUrl,
    finishReading,
    openAfterLoading,
    close,
    save,
  };
}
