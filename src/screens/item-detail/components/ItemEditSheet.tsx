import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { cssInterop } from "nativewind";
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import CameraSvg from "@/assets/images/icon-camera.svg";
import TooltipSvg from "@/assets/images/icon-tooltip.svg";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { TextField } from "@/components/Field";
import { Tooltip } from "@/components/Tooltip";
import type { WishLevelKey } from "@/types/wish-item";

import { WishLevelSelect } from "./WishLevelSelect";

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

export type ItemEditValues = {
  name: string;
  price: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  wishLevel: WishLevelKey | null;
};

type ItemEditSheetProps = {
  visible: boolean;
  initialValues: ItemEditValues;
  onRequestClose: () => void;
  onSubmit: (values: ItemEditValues) => void;
};

export function ItemEditSheet({
  visible,
  initialValues,
  onRequestClose,
  onSubmit,
}: ItemEditSheetProps) {
  const [values, setValues] = useState(initialValues);
  const [isLevelOpen, setLevelOpen] = useState(false);
  const [isHintOpen, setHintOpen] = useState(false);
  const hintRef = useRef<View>(null);
  const [hintAnchor, setHintAnchor] = useState<Anchor>({ x: 0, y: 0, width: 0, height: 0 });

  const update =
    <K extends keyof ItemEditValues>(key: K) =>
    (value: ItemEditValues[K]) =>
      setValues((prev) => ({ ...prev, [key]: value }));

  // 시안의 수정 완료는 비활성이다. 위시 레벨은 필수가 아니므로 값이 바뀌었는지로 판단한다.
  const isDirty = (Object.keys(values) as (keyof ItemEditValues)[]).some(
    (key) => values[key] !== initialValues[key],
  );

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
    <BottomSheet visible={visible} isScrimClosable={false} onRequestClose={handleClose}>
      {/* 시안 Body gap-25 > Form gap-16 > Fields gap-30 */}
      <ScrollView
        className="px-margin"
        contentContainerStyle={{ gap: 25 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4">
          <View className="gap-[30px]">
            <View className="items-center gap-1">
              <Text className="text-gray-1000 font-label-16-semibold">아이템 정보 수정</Text>
              <Text className="text-center text-gray-700 font-b3">
                아이템 정보를 직접 수정해 보세요.{"\n"}URL은 수정할 수 없습니다.
              </Text>
            </View>

            <View className="gap-4">
              <View className="gap-2">
                <Text className="text-gray-900 font-b3">아이템 이미지</Text>
                <View className="w-[92px]">
                  <StyledImage
                    className="size-[92px] rounded-field bg-gray-100"
                    contentFit="cover"
                    source={values.thumbnailUrl ?? undefined}
                  />
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
                <Text className="text-gray-900 font-b3">아이템 이름</Text>
                <TextField value={values.name} onChangeText={update("name")} />
              </View>

              <View className="gap-2">
                <Text className="text-gray-900 font-b3">가격</Text>
                <TextField
                  keyboardType="number-pad"
                  value={values.price}
                  onChangeText={update("price")}
                />
              </View>

              <View className="gap-2">
                <Text className="text-gray-900 font-b3">아이템 출처</Text>
                <TextField value={values.sourceUrl} onChangeText={update("sourceUrl")} />
              </View>
            </View>
          </View>

          {/* 시안 WishscoreRow 는 32 높이고 도움말 버튼만 48 로 겹쳐 놓는다. */}
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

        <View className="flex-row justify-between">
          <Button className="w-[155px]" variant="secondary" onPress={handleClose}>
            원본 유지하기
          </Button>
          <Button className="w-[155px]" isDisabled={!isDirty} onPress={() => onSubmit(values)}>
            수정 완료
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
