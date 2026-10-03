import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import CameraSvg from "@/assets/images/icon-camera.svg";
import ChevronSvg from "@/assets/images/icon-chevron.svg";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { TextField } from "@/components/Field";
import { colors } from "@/theme";

const StyledImage = cssInterop(Image, { className: "style" });

export type SaveToAllValues = {
  name: string;
  price: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  folder: string;
};

type SaveToAllSheetProps = {
  visible: boolean;
  initialValues: SaveToAllValues;
  onPressFolder: () => void;
  onRequestClose: () => void;
  onSubmit: (values: SaveToAllValues) => void;
};

export function SaveToAllSheet({
  visible,
  initialValues,
  onPressFolder,
  onRequestClose,
  onSubmit,
}: SaveToAllSheetProps) {
  const [values, setValues] = useState(initialValues);

  const update =
    <K extends keyof SaveToAllValues>(key: K) =>
    (value: SaveToAllValues[K]) =>
      setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <BottomSheet visible={visible} showGrabber bottomPadding={32} onRequestClose={onRequestClose}>
      <ScrollView className="px-margin" contentContainerStyle={{ gap: 25 }}>
        <View className="gap-4">
          <View className="gap-[30px]">
            <View className="items-center gap-1">
              <Text className="text-gray-1000 font-label-16-semibold">내 ALL에 저장</Text>
              <Text className="text-center text-gray-700 font-b3">
                작성자가 저장한 정보를 그대로 불러왔습니다.{"\n"}필요한 내용을 수정하고 폴더를
                선택해 주세요.
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
                    onPress={() => {}}
                  >
                    <CameraSvg width={14} height={12} color={colors.gray[900]} />
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

          <View className="h-8 flex-row items-center justify-between">
            <Text className="text-gray-900 font-b3">저장할 폴더</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`저장할 폴더 ${values.folder}`}
              className="h-8 flex-row items-center justify-center gap-2 rounded-full border border-gray-300 bg-gray-0 px-3 active:opacity-75"
              onPress={onPressFolder}
            >
              <Text className="text-gray-900 font-label-14">{values.folder}</Text>
              {/* 열림 여부와 무관하게 항상 위쪽 화살표임 */}
              <View
                className="size-4 items-center justify-center"
                style={{ transform: [{ rotate: "180deg" }] }}
              >
                <ChevronSvg width={12} height={12} color={colors.gray[900]} />
              </View>
            </Pressable>
          </View>
        </View>

        <View className="flex-row justify-between">
          <Button className="w-[155px]" variant="secondary" onPress={onRequestClose}>
            취소
          </Button>
          <Button className="w-[155px]" onPress={() => onSubmit(values)}>
            저장하기
          </Button>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
