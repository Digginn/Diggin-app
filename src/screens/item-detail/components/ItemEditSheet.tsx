import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import CameraSvg from "@/assets/images/icon-camera.svg";
import TooltipSvg from "@/assets/images/icon-tooltip.svg";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { TextField } from "@/components/Field";

import { WishLevelSelect } from "./WishLevelSelect";

const StyledImage = cssInterop(Image, { className: "style" });
const CameraIcon = cssInterop(CameraSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});
const TooltipIcon = cssInterop(TooltipSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

export type ItemEditValues = {
  name: string;
  price: string;
  sourceUrl: string;
};

type ItemEditSheetProps = {
  visible: boolean;
  initialValues: ItemEditValues;
  thumbnailUrl?: string | null;
  wishLevelLabel: string | null;
  onRequestClose: () => void;
  onOpenWishLevel: () => void;
  onOpenTooltip: () => void;
  onPickImage: () => void;
  onSubmit: (values: ItemEditValues) => void;
};

export function ItemEditSheet({
  visible,
  initialValues,
  thumbnailUrl,
  wishLevelLabel,
  onRequestClose,
  onOpenWishLevel,
  onOpenTooltip,
  onPickImage,
  onSubmit,
}: ItemEditSheetProps) {
  const [values, setValues] = useState(initialValues);

  const update = (key: keyof ItemEditValues) => (text: string) =>
    setValues((prev) => ({ ...prev, [key]: text }));

  return (
    <BottomSheet visible={visible} onRequestClose={onRequestClose}>
      <ScrollView className="px-margin" contentContainerStyle={{ gap: 30, paddingBottom: 16 }}>
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
                className="size-[92px] rounded-[5px] bg-gray-100"
                contentFit="cover"
                source={thumbnailUrl ?? undefined}
              />
              <Pressable
                accessibilityLabel="아이템 이미지 변경"
                accessibilityRole="button"
                className="absolute -bottom-1 right-0 size-6 items-center justify-center rounded-[5px] bg-gray-0 active:opacity-75"
                onPress={onPickImage}
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

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Text className="text-gray-900 font-b3">위시 레벨</Text>
            <Pressable
              accessibilityLabel="위시 레벨 설명"
              accessibilityRole="button"
              className="size-12 items-center justify-center"
              onPress={onOpenTooltip}
            >
              <TooltipIcon className="size-6" />
            </Pressable>
          </View>
          <WishLevelSelect label={wishLevelLabel ?? "미선택"} onPress={onOpenWishLevel} />
        </View>

        <View className="flex-row justify-between">
          <Button className="w-[155px]" variant="secondary" onPress={onRequestClose}>
            원본 유지하기
          </Button>
          <Button
            className="w-[155px]"
            isDisabled={wishLevelLabel === null}
            onPress={() => onSubmit(values)}
          >
            수정 완료
          </Button>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
