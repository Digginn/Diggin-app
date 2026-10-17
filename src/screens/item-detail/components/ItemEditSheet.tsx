import { cssInterop } from "nativewind";
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import TooltipSvg from "@/assets/images/icon-tooltip.svg";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { TextField } from "@/components/Field";
import { ActionModal } from "@/components/modal";
import { Tooltip } from "@/components/Tooltip";
import { WishLevelSelect } from "@/components/WishLevelSelect";
import { useNativeModalVisible } from "@/hooks/useNativeModalVisible";
import type { ItemSaveValues } from "@/types/wish-item";

import { formatPriceInput } from "../utils/formatPriceInput";

const TooltipIcon = cssInterop(TooltipSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

const HINT = "얼마나 사고 싶은지를\n3단계로 기록해두어\nALL 탭에서 빠르게\n분류할 수 있습니다.";

const HINT_GAP = 10;
const HINT_TOP_OFFSET = 4;

function FieldLabel({ label, isMissing }: { label: string; isMissing: boolean }) {
  return (
    <View className="flex-row items-start gap-2">
      <Text className="text-gray-900 font-b3">{label}</Text>
      {isMissing && <Text className="text-semantic-error font-note">*필수 정보</Text>}
    </View>
  );
}

type Anchor = { x: number; y: number; width: number; height: number };

const DESCRIPTION = {
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
  onSubmit: (values: ItemSaveValues) => void;
  /** 저장 요청 중에는 다시 누르지 못하게 막는다. */
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
  const [isLevelOpen, setLevelOpen] = useState(false);
  const [isHintOpen, setHintOpen] = useState(false);
  const [isExitOpen, setExitOpen] = useState(false);
  const hintRef = useRef<View>(null);
  const [hintAnchor, setHintAnchor] = useState<Anchor>({ x: 0, y: 0, width: 0, height: 0 });
  const isHintVisible = useNativeModalVisible(isHintOpen);

  const update =
    <K extends keyof ItemSaveValues>(key: K) =>
    (value: ItemSaveValues[K]) =>
      setValues((prev) => ({ ...prev, [key]: value }));

  // 위시 레벨은 필수가 아니라 값이 바뀌었는지로 판단한다.
  const isDirty = (Object.keys(values) as (keyof ItemSaveValues)[]).some(
    (key) => values[key] !== initialValues[key],
  );
  const isNameMissing = !values.name.trim();

  function toggleHint() {
    if (isHintOpen) {
      setHintOpen(false);
      return;
    }
    hintRef.current?.measureInWindow((x, y, width, height) => {
      setHintAnchor({ x, y, width, height });
      setHintOpen(true);
    });
  }

  function handleClose() {
    setLevelOpen(false);
    setHintOpen(false);
    onRequestClose();
  }

  // 취소는 버리겠다는 뜻이 분명해서 묻지 않고, 끌어내리기·뒤로가기만 묻는다.
  function requestClose() {
    if (!isDirty) return handleClose();
    setLevelOpen(false);
    setHintOpen(false);
    setExitOpen(true);
  }

  return (
    <BottomSheet
      visible={visible}
      isScrimClosable={false}
      isCloseConfirmed={isDirty}
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
        <View className="gap-4">
          <View className="gap-8">
            <View className="items-center gap-1">
              <Text className="text-gray-1000 font-label-16-semibold">아이템 정보 수정</Text>
              <Text className="text-center text-gray-700 font-b3">
                {hasExtractionFailed ? DESCRIPTION.failed : DESCRIPTION.loaded}
              </Text>
            </View>

            <View className="gap-4">
              <View className="gap-2">
                <FieldLabel label="아이템명" isMissing={isNameMissing} />
                <TextField
                  growsTo={88}
                  isError={isNameMissing}
                  placeholder="아이템명을 입력해 주세요."
                  value={values.name}
                  onChangeText={update("name")}
                />
              </View>

              <View className="flex-row gap-4">
                <View className="flex-1 gap-2">
                  <Text className="text-gray-900 font-b3">브랜드명</Text>
                  <TextField
                    placeholder="선택 입력"
                    value={values.brand}
                    onChangeText={update("brand")}
                  />
                </View>
                <View className="flex-1 gap-2">
                  <Text className="text-gray-900 font-b3">가격</Text>
                  {/* SAVE-005 가격은 선택값이다. 비워 두면 null로 저장해 "가격 정보 없음"으로 보인다. */}
                  <TextField
                    keyboardType="number-pad"
                    placeholder="가격 입력"
                    value={formatPriceInput(values.price)}
                    onChangeText={(text) => update("price")(text.replace(/\D/g, ""))}
                  />
                </View>
              </View>
            </View>
          </View>

          <View className="h-8 flex-row items-center justify-between">
            <View className="h-8 flex-row items-center">
              <Text className="text-gray-900 font-b3">위시 레벨</Text>
              <View ref={hintRef} className="h-8 w-12 items-center justify-center">
                <Pressable
                  accessibilityLabel="위시 레벨 설명"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isHintOpen }}
                  className="size-12 items-center justify-center active:opacity-75"
                  onPress={toggleHint}
                >
                  <TooltipIcon className="size-6" />
                </Pressable>
              </View>
            </View>
            <WishLevelSelect
              level={values.wishLevel}
              isOpen={isLevelOpen}
              onToggle={() => setLevelOpen((prev) => !prev)}
              onSelect={(level) => {
                update("wishLevel")(level);
                setLevelOpen(false);
              }}
            />
          </View>
        </View>

        <View className="flex-row gap-4">
          <Button className="flex-1" variant="secondary" onPress={handleClose}>
            취소
          </Button>
          <Button
            className="flex-1"
            isDisabled={isNameMissing || isSubmitting}
            onPress={() => onSubmit(values)}
          >
            저장하기
          </Button>
        </View>
      </ScrollView>

      <Modal
        visible={isHintVisible}
        transparent
        animationType="none"
        onRequestClose={() => setHintOpen(false)}
      >
        <Pressable className="absolute inset-0" onPress={() => setHintOpen(false)} />
        <View
          className="absolute"
          style={{
            left: hintAnchor.x + hintAnchor.width + HINT_GAP,
            top: hintAnchor.y + HINT_TOP_OFFSET,
          }}
        >
          <Tooltip arrowPosition="left" message={HINT} onClose={() => setHintOpen(false)} />
        </View>
      </Modal>
    </BottomSheet>
  );
}
