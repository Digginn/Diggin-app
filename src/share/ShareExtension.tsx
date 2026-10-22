import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { close, openHostApp, type InitialProps } from "expo-share-extension";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { findProductIdByUrl } from "@/api/products";
import { Spinner } from "@/components/Loading";
import { TOAST_MESSAGES } from "@/constants/messages";
import { ToastProvider } from "@/contexts/ToastContext";
import { EMPTY_ITEM_SAVE_VALUES, useItemSave } from "@/hooks/useItemSave";
import { useToast } from "@/hooks/useToast";
import { queryClient } from "@/lib/queryClient";
import { markSharedSave } from "@/lib/sharedSaves";
import { supabase } from "@/lib/supabase";
import { ItemEditSheet } from "@/screens/item-detail/components/ItemEditSheet";
import { ProductPageReader } from "@/screens/save/components/ProductPageReader";
import { ShareErrorSheet, type ShareErrorReason } from "@/screens/save/components/ShareErrorSheet";
import type { ItemSaveValues } from "@/types/wish-item";
import { classifyItemLink, findItemLink } from "@/utils/itemLink";

// 저장 완료 토스트를 잠깐 보여 준 뒤 쇼핑 앱으로 돌아간다(SAVE-014).
const CLOSE_AFTER_SAVE_MS = 1500;

/** SYS-014 다른 앱 위에 뜨는 공유 확장. 쇼핑 앱을 떠나지 않고 아이템 정보 시트(SAVE-06)에서 저장한다. */
export default function ShareExtension({ url, text }: InitialProps) {
  // 확장은 Info.plist의 폰트만으로는 Pretendard가 그려지지 않아, 앱처럼 직접 불러온 뒤 그린다.
  const [isFontLoaded, fontError] = useFonts({
    "Pretendard-Regular": require("@/assets/fonts/Pretendard-Regular.otf"),
    "Pretendard-Medium": require("@/assets/fonts/Pretendard-Medium.otf"),
    "Pretendard-SemiBold": require("@/assets/fonts/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("@/assets/fonts/Pretendard-Bold.otf"),
  });
  if (!isFontLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {/* 링크 칸에 앱 주소를, 글자 칸에 웹 링크를 함께 넘기는 앱이 있어 둘 다 본다. */}
          <ShareSave shared={[url, text].filter(Boolean).join(" ")} />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function ShareSave({ shared }: { shared: string }) {
  const linkError = classifyItemLink(shared);
  const link = linkError ? null : findItemLink(shared);
  const [sessionError, setSessionError] = useState<ShareErrorReason | null>(null);
  const reason = linkError ?? sessionError;
  const itemSave = useItemSave();
  const { start, save, isLoading, openAfterLoading } = itemSave;
  const hasStarted = useRef(false);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [isSaved, setSaved] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    if (!link || hasStarted.current) return;
    hasStarted.current = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (data.session) return start(link);
        // 만료된 토큰을 갱신하다 연결이 끊긴 것은 로그인이 풀린 게 아니다. 여기서 알리고 앱으로 보내지 않는다.
        if (isAuthRetryableFetchError(error)) return setSessionError("network");
        // 비회원은 앱에서 로그인한 뒤 이 링크로 저장을 이어 간다(SAVE-002).
        openHostApp(`login?shareUrl=${encodeURIComponent(link)}`);
      })
      .catch(() => setSessionError("network"));
  }, [link, start]);

  // 로딩 모달이 없어 닫히기를 기다리지 않고 바로 연다.
  useEffect(() => {
    if (!isLoading) openAfterLoading();
  }, [isLoading, openAfterLoading]);

  async function submit(values: ItemSaveValues) {
    // 같은 링크는 저장하지 않고 기존 아이템을 안내한다(SAVE-012). 확인에 실패하면 저장 때 서버가 막는다.
    const existingId = await findProductIdByUrl(values.sourceUrl).catch(() => null);
    if (existingId) return setDuplicateId(existingId);
    const { productId, isDuplicate } = await save.mutateAsync({ values, folderIds: [] });
    if (isDuplicate) return setDuplicateId(productId);
    markSharedSave();
    setSaved(true);
    showToast(TOAST_MESSAGES.SAVE_011);
    setTimeout(close, CLOSE_AFTER_SAVE_MS);
  }

  if (reason) {
    return (
      <View className="flex-1 bg-gray-0">
        <ShareErrorSheet reason={reason} onClose={close} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-0">
      {itemSave.readingUrl ? (
        <ProductPageReader
          key={itemSave.readingUrl}
          url={itemSave.readingUrl}
          onDone={itemSave.finishReading}
        />
      ) : null}
      {itemSave.values === null ? (
        <View accessibilityLiveRegion="polite" className="flex-1 items-center justify-center gap-4">
          <Spinner />
          <Text className="text-center text-gray-700 font-b3">
            아이템 정보를 불러오는 중입니다.
          </Text>
        </View>
      ) : null}
      <ItemEditSheet
        key={itemSave.values?.sourceUrl ?? ""}
        isInline
        visible={itemSave.values !== null}
        initialValues={itemSave.values ?? EMPTY_ITEM_SAVE_VALUES}
        hasExtractionFailed={itemSave.hasFailed}
        duplicate={
          duplicateId
            ? { onConfirm: () => openHostApp(`items/${duplicateId}`), onDismiss: close }
            : undefined
        }
        onRequestClose={close}
        onSubmit={submit}
        isSubmitting={save.isPending || isSaved}
        errorMessage={save.isError ? TOAST_MESSAGES.SAVE_012 : undefined}
        onErrorDismiss={save.reset}
      />
    </View>
  );
}
