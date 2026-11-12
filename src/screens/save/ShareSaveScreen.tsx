import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { findProductIdByUrl } from "@/api/products";
import { Spinner } from "@/components/Loading";
import { TOAST_MESSAGES } from "@/constants/messages";
import { useCreateFolder } from "@/hooks/useCreateFolder";
import { useFolders } from "@/hooks/useFolders";
import { EMPTY_ITEM_SAVE_VALUES, useItemSave } from "@/hooks/useItemSave";
import { useToast } from "@/hooks/useToast";
import { flushAnalytics, setAnalyticsUser } from "@/lib/analytics";
import { markSharedSave } from "@/lib/sharedSaves";
import { supabase } from "@/lib/supabase";
import { FolderManageSheet } from "@/screens/item-detail/components/FolderManageSheet";
import { ItemEditSheet } from "@/screens/item-detail/components/ItemEditSheet";
import { ProductPageReader } from "@/screens/save/components/ProductPageReader";
import { ShareErrorSheet, type ShareErrorReason } from "@/screens/save/components/ShareErrorSheet";
import { itemSaveErrorMessage } from "@/screens/save/domain/itemSaveError";
import type { ItemSaveValues } from "@/types/wish-item";
import { classifyItemLink, findItemLink } from "@/utils/itemLink";

const CLOSE_AFTER_SAVE_MS = 1500;

type ShareSaveScreenProps = {
  shared: string;
  onClose: () => void;
  onLogin: (url: string) => void;
  onOpenItem: (id: string) => void;
  isInline?: boolean;
};

export function ShareSaveScreen({
  shared,
  onClose,
  onLogin,
  onOpenItem,
  isInline = true,
}: ShareSaveScreenProps) {
  const linkError = classifyItemLink(shared);
  const link = linkError ? null : findItemLink(shared);
  const [sessionError, setSessionError] = useState<ShareErrorReason | null>(null);
  const reason = linkError ?? sessionError;
  const itemSave = useItemSave();
  const { start, save, isLoading, openAfterLoading } = itemSave;
  const hasStarted = useRef(false);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [isSaved, setSaved] = useState(false);
  const [folderValues, setFolderValues] = useState<ItemSaveValues | null>(null);
  const folders = useFolders();
  const createFolder = useCreateFolder();
  const showToast = useToast();
  const isMounted = useRef(true);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!link || hasStarted.current) return;
    hasStarted.current = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted.current) return;
        if (data.session) {
          // iOS 공유 확장은 앱과 따로 실행돼 AuthProvider가 없다.
          setAnalyticsUser(data.session.user.id);
          return start(link, "share");
        }
        // 만료된 토큰을 갱신하다 연결이 끊긴 것은 로그인이 풀린 게 아니다. 여기서 알리고 앱으로 보내지 않는다.
        if (isAuthRetryableFetchError(error)) return setSessionError("network");
        // 비회원은 앱에서 로그인한 뒤 이 링크로 저장을 이어 간다(SAVE-002).
        onLogin(link);
      })
      .catch(() => {
        if (isMounted.current) setSessionError("network");
      });
  }, [link, start, onLogin]);

  // 로딩 모달이 없어 닫히기를 기다리지 않고 바로 연다.
  useEffect(() => {
    if (!isLoading) openAfterLoading();
  }, [isLoading, openAfterLoading]);

  // 폴더를 다 고른 뒤에 중복을 알리지 않도록 폴더 선택 전에 확인한다(SAVE-012). 확인에 실패하면 저장 때 서버가 막는다.
  async function openFolderSelect(values: ItemSaveValues) {
    const [existingId, folderResult] = await Promise.all([
      findProductIdByUrl(values.sourceUrl).catch(() => null),
      folders.data ? folders : folders.refetch(),
    ]);
    if (!isMounted.current) return;
    if (existingId) return setDuplicateId(existingId);
    // 폴더 목록 없이 열면 빈 목록이라 폴더 없이 저장하게 된다.
    if (!folderResult.data) return showToast(TOAST_MESSAGES.SYS_001, "error");
    save.reset();
    setFolderValues(values);
  }

  async function submit(values: ItemSaveValues, folderIds: string[]) {
    const { productId, isDuplicate } = await save.mutateAsync({ values, folderIds });
    if (!isMounted.current) return;
    if (isDuplicate) {
      // 중복 안내는 정보수정 시트에 붙어 있어, 폴더 선택을 닫아 시트를 다시 보여 준다.
      setFolderValues(null);
      return setDuplicateId(productId);
    }
    markSharedSave();
    setSaved(true);
    showToast(TOAST_MESSAGES.SAVE_011);
    closeTimer.current = setTimeout(
      () =>
        void flushAnalytics()
          .catch(() => {})
          .finally(onClose),
      CLOSE_AFTER_SAVE_MS,
    );
  }

  if (reason) {
    return (
      <View className="flex-1 bg-gray-0">
        <ShareErrorSheet reason={reason} onClose={onClose} />
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
        isInline={isInline}
        visible={itemSave.values !== null && folderValues === null}
        initialValues={itemSave.values ?? EMPTY_ITEM_SAVE_VALUES}
        hasExtractionFailed={itemSave.hasFailed}
        duplicate={
          duplicateId ? { onConfirm: () => onOpenItem(duplicateId), onDismiss: onClose } : undefined
        }
        onRequestClose={onClose}
        onSubmit={openFolderSelect}
        submitLabel="폴더 선택하기"
      />
      {/* 클립보드로 불러온 저장과 같이 폴더를 고른 뒤 저장한다(SAVE-10 → PDT-08). */}
      {folderValues && folders.data ? (
        <FolderManageSheet
          isInline={isInline}
          title="저장할 폴더 선택"
          completeLabel="저장하기"
          backLabel="취소"
          folders={folders.data}
          selectedFolderIds={[]}
          isNewItem
          onBack={() => setFolderValues(null)}
          onClose={() => setFolderValues(null)}
          onCreateFolder={(name) => createFolder.mutateAsync(name)}
          onComplete={(ids) => submit(folderValues, ids)}
          isCompleting={save.isPending || isSaved}
          errorMessage={save.isError ? itemSaveErrorMessage(save.error) : undefined}
          onErrorDismiss={save.reset}
        />
      ) : null}
    </View>
  );
}
