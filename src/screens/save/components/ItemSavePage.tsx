import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { findProductIdByUrl } from "@/api/products";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { ItemInfoFields, type ItemInfoOverlay } from "@/components/ItemInfoFields";
import { ActionModal } from "@/components/modal";
import { ToastText } from "@/components/ToastText";
import { TOAST_MESSAGES } from "@/constants/messages";
import { useCreateFolder } from "@/hooks/useCreateFolder";
import { useFolders } from "@/hooks/useFolders";
import { FolderManageSheet } from "@/screens/item-detail/components/FolderManageSheet";
import { ITEM_INFO_DESCRIPTION } from "@/screens/item-detail/components/ItemEditSheet";
import type { ItemSaveValues } from "@/types/wish-item";

import { isRestrictedProduct, RESTRICTED_PRODUCT_MESSAGE } from "../domain/restrictedProduct";

type ItemSavePageProps = {
  visible: boolean;
  initialValues: ItemSaveValues;
  hasExtractionFailed: boolean;
  onRequestClose: () => void;
  onSubmit: (values: ItemSaveValues, folderIds: string[]) => Promise<unknown>;
  /** SAVE-012 이미 저장한 링크면 기존 아이템 상세로 보낸다. */
  onOpenDuplicate: (productId: string) => void;
  isSubmitting: boolean;
  errorMessage?: string;
  onErrorDismiss: () => void;
};

/**
 * SAVE-10 불러온 정보를 확인·수정하는 풀페이지. 아래에서 올라오며 들어오고,
 * 폴더 선택하기 → 저장할 폴더 선택 시트(PDT-08)에서 저장한다.
 */
export function ItemSavePage({
  visible,
  initialValues,
  hasExtractionFailed,
  onRequestClose,
  onSubmit,
  onOpenDuplicate,
  isSubmitting,
  errorMessage,
  onErrorDismiss,
}: ItemSavePageProps) {
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState(initialValues);
  const [overlay, setOverlay] = useState<ItemInfoOverlay>(null);
  const [isExitOpen, setExitOpen] = useState(false);
  const [isFolderOpen, setFolderOpen] = useState(false);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [isChecking, setChecking] = useState(false);
  // 상태는 다시 그린 뒤에야 버튼을 막아, 그 사이 들어온 연타는 ref로 막는다.
  const isCheckingRef = useRef(false);
  const isOpeningDuplicateRef = useRef(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [toast, setToast] = useState<string>();
  const folders = useFolders();
  const createFolder = useCreateFolder();

  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardWillHide", () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const isDirty = (Object.keys(values) as (keyof ItemSaveValues)[]).some(
    (key) => values[key] !== initialValues[key],
  );
  const isNameMissing = !values.name.trim();

  function close() {
    setOverlay(null);
    onRequestClose();
  }

  function requestClose() {
    if (!isDirty) return close();
    setOverlay(null);
    setExitOpen(true);
  }

  // 폴더를 다 고른 뒤에 중복을 알리지 않도록 시트를 열기 전에 확인한다. 확인에 실패하면 저장 때 서버가 막는다.
  async function openFolderSheet() {
    if (isRestrictedProduct(values.name, values.restrictionLabels)) {
      setToast(RESTRICTED_PRODUCT_MESSAGE);
      return;
    }
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    setOverlay(null);
    Keyboard.dismiss();
    // 앞서 실패한 저장의 안내가 다시 연 시트에 같이 뜨지 않게 지운다.
    onErrorDismiss();
    setChecking(true);
    // 폴더 목록을 못 불러온 채 열면 빈 목록이라 폴더 없이 저장하게 된다. 다시 불러오고, 그래도 없으면 열지 않는다.
    const [productId, folderResult] = await Promise.all([
      findProductIdByUrl(values.sourceUrl).catch(() => null),
      folders.data ? folders : folders.refetch(),
    ]);
    isCheckingRef.current = false;
    setChecking(false);
    if (productId) setDuplicateId(productId);
    else if (!folderResult.data) setToast(TOAST_MESSAGES.SYS_001);
    else setFolderOpen(true);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={requestClose}>
      {/* AppBar가 상태 표시줄 높이만큼 위 여백을 이미 넣는다. */}
      <View className="flex-1 bg-gray-0">
        <AppBar title="아이템 정보 수정" onBack={requestClose} isDisabled={isFolderOpen} />

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            className="flex-1 px-margin"
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 24, gap: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-center text-gray-700 font-b3">
              {hasExtractionFailed ? ITEM_INFO_DESCRIPTION.failed : ITEM_INFO_DESCRIPTION.loaded}
            </Text>
            <ItemInfoFields
              values={values}
              onChange={setValues}
              overlay={overlay}
              onOverlayChange={setOverlay}
            />
          </ScrollView>

          {/* 키보드가 올라오면 버튼을 키보드 바로 위 16에 둔다(시안 SAVE-10_정보 입력 중 키보드 노출). */}
          <View
            className="px-margin"
            style={{ paddingBottom: isKeyboardVisible ? 16 : Math.max(insets.bottom, 16) }}
          >
            <Button isDisabled={isNameMissing || isChecking} onPress={openFolderSheet}>
              폴더 선택하기
            </Button>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* 페이지가 네이티브 모달이라 앱 전체 토스트는 가려져 여기서 띄운다. */}
      {toast ? (
        <View pointerEvents="none" className="absolute inset-x-0 bottom-[160px] items-center">
          <ToastText message={toast} variant="error" />
        </View>
      ) : null}

      {visible && isFolderOpen && folders.data && (
        <FolderManageSheet
          title="저장할 폴더 선택"
          completeLabel="저장하기"
          backLabel="취소"
          folders={folders.data}
          // 선택된 폴더 없이 시작하고, 미선택 저장도 허용한다(PDT-004).
          selectedFolderIds={[]}
          isNewItem
          onBack={() => setFolderOpen(false)}
          onClose={() => setFolderOpen(false)}
          onCreateFolder={(name) => createFolder.mutateAsync(name)}
          onComplete={(ids) => onSubmit(values, ids)}
          isCompleting={isSubmitting}
          errorMessage={errorMessage}
          onErrorDismiss={onErrorDismiss}
        />
      )}

      <ActionModal
        visible={duplicateId !== null}
        type="2Btn"
        title="이미 저장한 아이템입니다."
        description="기존에 저장한 아이템을 확인하시겠습니까?"
        // 같은 링크는 저장할 수 없어 페이지에 남을 이유가 없다.
        secondaryAction={{
          label: "괜찮아요",
          onPress: () => {
            setDuplicateId(null);
            close();
          },
        }}
        primaryAction={{
          label: "확인하기",
          onPress: () => {
            if (!duplicateId || isOpeningDuplicateRef.current) return;
            isOpeningDuplicateRef.current = true;
            onOpenDuplicate(duplicateId);
            setDuplicateId(null);
          },
        }}
        onRequestClose={() => setDuplicateId(null)}
      />
      <ActionModal
        visible={isExitOpen}
        type="2Btn"
        title="작성을 그만두시겠습니까?"
        description="작성 중인 내용은 저장되지 않습니다."
        secondaryAction={{ label: "계속 작성", onPress: () => setExitOpen(false) }}
        primaryAction={{
          label: "나가기",
          onPress: () => {
            setExitOpen(false);
            close();
          },
        }}
        onRequestClose={() => setExitOpen(false)}
      />
    </Modal>
  );
}
