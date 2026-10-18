import { useEffect, useState } from "react";
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
import { ActionModal } from "@/components/modal";
import { useCreateFolder } from "@/hooks/useCreateFolder";
import { useFolders } from "@/hooks/useFolders";
import { FolderManageSheet } from "@/screens/item-detail/components/FolderManageSheet";
import { ITEM_INFO_DESCRIPTION } from "@/screens/item-detail/components/ItemEditSheet";
import {
  ItemInfoFields,
  type ItemInfoOverlay,
} from "@/screens/item-detail/components/ItemInfoFields";
import type { ItemSaveValues } from "@/types/wish-item";

type ItemSavePageProps = {
  visible: boolean;
  initialValues: ItemSaveValues;
  hasExtractionFailed: boolean;
  onRequestClose: () => void;
  onSubmit: (values: ItemSaveValues, folderIds: string[]) => void;
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
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
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

  const isDirty = (Object.keys(values) as (keyof ItemSaveValues)[]).some(
    (key) => values[key] !== initialValues[key],
  );
  const isNameMissing = !values.name.trim();

  function close() {
    setOverlay(null);
    onRequestClose();
  }

  // 뒤로가기는 작성 중인 내용이 있으면 버릴지 묻는다.
  function requestClose() {
    if (!isDirty) return close();
    setOverlay(null);
    setExitOpen(true);
  }

  // 폴더를 다 고른 뒤에 중복을 알리지 않도록 시트를 열기 전에 확인한다. 확인에 실패하면 저장 때 서버가 막는다.
  async function openFolderSheet() {
    setOverlay(null);
    Keyboard.dismiss();
    setChecking(true);
    const productId = await findProductIdByUrl(values.sourceUrl).catch(() => null);
    setChecking(false);
    if (productId) setDuplicateId(productId);
    else setFolderOpen(true);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={requestClose}>
      <View className="flex-1 bg-gray-0" style={{ paddingTop: insets.top }}>
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

      {visible && isFolderOpen && (
        <FolderManageSheet
          title="저장할 폴더 선택"
          completeLabel="저장하기"
          backLabel="취소"
          folders={folders.data ?? []}
          // 선택된 폴더 없이 시작하고, 미선택 저장도 허용한다(PDT-004).
          selectedFolderIds={[]}
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
            if (duplicateId) onOpenDuplicate(duplicateId);
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
