import { useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { ItemInfoFields, type ItemInfoOverlay } from "@/components/ItemInfoFields";
import { ActionModal } from "@/components/modal";
import type { ItemSaveValues } from "@/types/wish-item";

export const ITEM_INFO_DESCRIPTION = {
  loaded: "불러온 정보를 확인하고 저장해 주세요.",
  failed:
    "아이템 정보를 불러오지 못했습니다.\n아이템 링크는 유지했어요. 정보를 직접 입력해 저장할 수 있어요.",
} as const;

type ItemEditSheetProps = {
  visible: boolean;
  initialValues: ItemSaveValues;
  /** 정보를 불러오지 못하면 안내 문구가 바뀌고 사용자가 직접 채운다. */
  hasExtractionFailed?: boolean;
  /** 이미 저장한 링크면 기존 아이템으로 갈지 묻는다. */
  duplicate?: { onConfirm: () => void; onDismiss: () => void };
  onRequestClose: () => void;
  /** 저장 요청이면 Promise를 돌려준다. 끝날 때까지 다시 누르거나 닫을 수 없다. */
  onSubmit: (values: ItemSaveValues) => void | Promise<unknown>;
  /** 이미 보낸 요청은 닫아도 저장되니, 저장 중에는 다시 누르기와 취소·끌어내리기를 모두 막는다. */
  isSubmitting?: boolean;
  /** 시트가 네이티브 모달이라 저장 실패는 시트 위 토스트로 알린다. */
  errorMessage?: string;
  onErrorDismiss?: () => void;
};

export function ItemEditSheet({
  visible,
  initialValues,
  hasExtractionFailed = false,
  duplicate,
  onRequestClose,
  onSubmit,
  isSubmitting = false,
  errorMessage,
  onErrorDismiss,
}: ItemEditSheetProps) {
  const [values, setValues] = useState(initialValues);
  const [overlay, setOverlay] = useState<ItemInfoOverlay>(null);
  const [isExitOpen, setExitOpen] = useState(false);
  // isSubmitting은 다시 그린 뒤에야 버튼을 막아, 그 사이 들어온 연타는 여기서 막는다.
  const isSubmittingRef = useRef(false);

  // 위시 레벨은 필수가 아니라 값이 바뀌었는지로 판단한다.
  const isDirty = (Object.keys(values) as (keyof ItemSaveValues)[]).some(
    (key) => values[key] !== initialValues[key],
  );
  const isNameMissing = !values.name.trim();

  async function submit() {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      await onSubmit(values);
    } catch {
      // 실패는 부모가 errorMessage로 알린다.
    } finally {
      isSubmittingRef.current = false;
    }
  }

  function handleClose() {
    if (isSubmittingRef.current) return;
    setOverlay(null);
    onRequestClose();
  }

  // 취소는 버리겠다는 뜻이 분명해서 묻지 않고, 끌어내리기·뒤로가기만 묻는다.
  function requestClose() {
    if (isSubmittingRef.current) return;
    if (!isDirty) return handleClose();
    setOverlay(null);
    setExitOpen(true);
  }

  return (
    <BottomSheet
      visible={visible}
      isScrimClosable={false}
      isCloseConfirmed={isDirty || isSubmitting}
      onRequestClose={requestClose}
      toastMessage={errorMessage}
      toastVariant="error"
      onToastDismiss={onErrorDismiss}
      overlay={
        <>
          <ActionModal
            visible={duplicate !== undefined}
            type="2Btn"
            title="이미 저장한 아이템입니다."
            description="기존에 저장한 아이템을 확인하시겠습니까?"
            secondaryAction={{ label: "괜찮아요", onPress: () => duplicate?.onDismiss() }}
            primaryAction={{ label: "확인하기", onPress: () => duplicate?.onConfirm() }}
            onRequestClose={() => duplicate?.onDismiss()}
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
                handleClose();
              },
            }}
            onRequestClose={() => setExitOpen(false)}
          />
        </>
      }
    >
      <ScrollView
        className="px-margin"
        contentContainerStyle={{ gap: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-8">
          <View className="items-center gap-1">
            <Text className="text-gray-1000 font-label-16-semibold">아이템 정보 수정</Text>
            <Text className="text-center text-gray-700 font-b3">
              {hasExtractionFailed ? ITEM_INFO_DESCRIPTION.failed : ITEM_INFO_DESCRIPTION.loaded}
            </Text>
          </View>
          <View className="gap-4">
            <ItemInfoFields
              values={values}
              onChange={setValues}
              overlay={overlay}
              onOverlayChange={setOverlay}
            />
          </View>
        </View>

        <View className="flex-row gap-4">
          <Button
            className="flex-1"
            variant="secondary"
            isDisabled={isSubmitting}
            onPress={handleClose}
          >
            취소
          </Button>
          <Button className="flex-1" isDisabled={isNameMissing || isSubmitting} onPress={submit}>
            저장하기
          </Button>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
