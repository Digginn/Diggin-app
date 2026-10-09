import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { cssInterop } from "nativewind";
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import CameraSvg from "@/assets/images/icon-camera.svg";
import TooltipSvg from "@/assets/images/icon-tooltip.svg";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { FallbackImg } from "@/components/FallbackImg";
import { TextField } from "@/components/Field";
import { ActionModal } from "@/components/modal";
import { Tooltip } from "@/components/Tooltip";
import { WishLevelSelect } from "@/components/WishLevelSelect";
import type { WishLevelKey } from "@/types/wish-item";

const StyledImage = cssInterop(Image, { className: "style" });
const CameraIcon = cssInterop(CameraSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});
const TooltipIcon = cssInterop(TooltipSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

const HINT = "얼마나 사고 싶은지를\n3단계로 기록해두어\nALL 탭에서 빠르게\n분류할 수 있습니다.";

const HINT_GAP = 10;
const HINT_TOP_OFFSET = 4;

type Anchor = { x: number; y: number; width: number; height: number };

export type ItemSaveValues = {
  name: string;
  brand: string;
  price: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  wishLevel: WishLevelKey | null;
};

type ItemSaveSheetProps = {
  visible: boolean;
  initialValues: ItemSaveValues;
  /** 정보를 불러오지 못하면 안내 문구가 바뀌고 사용자가 직접 채운다. */
  hasExtractionFailed?: boolean;
  /** 이미 저장한 링크면 기존 아이템으로 갈지 묻는다. */
  duplicate?: { onConfirm: () => void; onDismiss: () => void };
  onRequestClose: () => void;
  onSubmit: (values: ItemSaveValues) => void;
};

const DESCRIPTION = {
  loaded: "불러온 정보를 확인하고 저장해 주세요.\n아이템 링크는 수정할 수 없습니다.",
  failed:
    "아이템 정보를 불러오지 못했습니다.\n아이템 링크는 유지했어요. 정보를 직접 입력해 저장할 수 있어요.",
} as const;

export function ItemSaveSheet({
  visible,
  initialValues,
  hasExtractionFailed = false,
  duplicate,
  onRequestClose,
  onSubmit,
}: ItemSaveSheetProps) {
  const [values, setValues] = useState(initialValues);
  const [isLevelOpen, setLevelOpen] = useState(false);
  const [isHintOpen, setHintOpen] = useState(false);
  const hintRef = useRef<View>(null);
  const [hintAnchor, setHintAnchor] = useState<Anchor>({ x: 0, y: 0, width: 0, height: 0 });

  const update =
    <K extends keyof ItemSaveValues>(key: K) =>
    (value: ItemSaveValues[K]) =>
      setValues((prev) => ({ ...prev, [key]: value }));

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    update("thumbnailUrl")(result.assets[0].uri);
  }

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

  return (
    <BottomSheet
      visible={visible}
      isScrimClosable={false}
      onRequestClose={handleClose}
      // 시트가 네이티브 모달이라 중복 안내도 같은 레이어 안에서 띄워야 보인다.
      overlay={
        <ActionModal
          visible={duplicate !== undefined}
          type="2Btn"
          title="이미 저장한 아이템입니다."
          description="기존에 저장한 아이템을 확인하시겠습니까?"
          secondaryAction={{ label: "괜찮아요", onPress: () => duplicate?.onDismiss() }}
          primaryAction={{ label: "확인하기", onPress: () => duplicate?.onConfirm() }}
          onRequestClose={() => duplicate?.onDismiss()}
        />
      }
    >
      <ScrollView
        className="px-margin"
        contentContainerStyle={{ gap: 25 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4">
          <View className="gap-[30px]">
            <View className="items-center gap-1">
              <Text className="text-gray-1000 font-label-16-semibold">아이템 정보 확인</Text>
              <Text className="text-center text-gray-700 font-b3">
                {hasExtractionFailed ? DESCRIPTION.failed : DESCRIPTION.loaded}
              </Text>
            </View>

            <View className="gap-4">
              <View className="gap-2">
                <Text className="text-gray-900 font-b3">아이템 이미지</Text>
                <View className="w-[92px]">
                  {values.thumbnailUrl ? (
                    <StyledImage
                      className="size-[92px] rounded-field bg-gray-100"
                      contentFit="cover"
                      source={values.thumbnailUrl}
                    />
                  ) : (
                    <FallbackImg size="field" className="size-[92px] rounded-lg" />
                  )}
                  <Pressable
                    accessibilityLabel="아이템 이미지 변경"
                    accessibilityRole="button"
                    className="absolute bottom-0 right-0 size-6 items-center justify-center rounded-field bg-gray-0 active:opacity-75"
                    hitSlop={12}
                    onPress={handlePickImage}
                  >
                    <CameraIcon className="h-3 w-3.5" />
                  </Pressable>
                </View>
              </View>

              <View className="gap-2">
                {/* 저장에 꼭 필요한 값이라 라벨 옆에 표시한다. */}
                <View className="flex-row items-start gap-2">
                  <Text className="text-gray-900 font-b3">아이템명</Text>
                  <Text className="text-semantic-error font-note">*필수 정보</Text>
                </View>
                <TextField
                  placeholder="아이템명을 입력해 주세요."
                  value={values.name}
                  onChangeText={update("name")}
                />
              </View>

              <View className="flex-row gap-[17px]">
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
                  <TextField
                    keyboardType="number-pad"
                    placeholder="선택 입력"
                    value={values.price}
                    onChangeText={update("price")}
                  />
                </View>
              </View>

              <View className="gap-2">
                <Text className="text-gray-900 font-b3">아이템 링크</Text>
                {/* 불러온 링크는 수정 대상이 아니다. */}
                <TextField editable={false} value={values.sourceUrl} />
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

        <View className="flex-row gap-[17px]">
          <Button className="flex-1" variant="secondary" onPress={handleClose}>
            취소
          </Button>
          {/* 아이템명이 비면 저장할 게 없다. */}
          <Button
            className="flex-1"
            isDisabled={values.name.trim().length === 0}
            onPress={() => onSubmit(values)}
          >
            저장하기
          </Button>
        </View>
      </ScrollView>

      <Modal
        visible={isHintOpen}
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
