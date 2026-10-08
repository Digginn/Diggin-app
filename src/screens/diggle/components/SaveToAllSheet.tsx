import { clsx } from "clsx";
import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import CameraSvg from "@/assets/images/icon-camera.svg";
import ChevronSvg from "@/assets/images/icon-chevron.svg";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { TextField } from "@/components/Field";
import { colors } from "@/theme";
import { WISH_LEVEL_DOT_CLASSNAMES, WISH_LEVEL_LABELS, type WishLevelKey } from "@/types/wish-item";

const StyledImage = cssInterop(Image, { className: "style" });

const LEVEL_KEYS: WishLevelKey[] = ["high", "medium", "low"];

const LEVEL_MENU_SHADOW = {
  shadowColor: colors.gray[1000],
  shadowOffset: { width: 0, height: 4 },
  shadowRadius: 10,
  shadowOpacity: 0.1,
  elevation: 4,
};

export type SaveToAllValues = {
  name: string;
  price: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  wishLevel: WishLevelKey | null;
};

type SaveToAllSheetProps = {
  visible: boolean;
  /** 폴더 선택 시트. RN 은 모달을 나란히 띄우지 못해 이 시트 안에서 겹쳐 띄운다. */
  overlay?: ReactNode;
  values: SaveToAllValues;
  onChange: (values: SaveToAllValues) => void;
  onRequestClose: () => void;
  onNext: () => void;
};

export function SaveToAllSheet({
  visible,
  overlay,
  values,
  onChange,
  onRequestClose,
  onNext,
}: SaveToAllSheetProps) {
  const [isLevelOpen, setLevelOpen] = useState(false);

  const update =
    <K extends keyof SaveToAllValues>(key: K) =>
    (value: SaveToAllValues[K]) =>
      onChange({ ...values, [key]: value });

  return (
    <BottomSheet
      visible={visible}
      isScrimClosable={false}
      overlay={overlay}
      onRequestClose={onRequestClose}
    >
      <ScrollView className="px-margin" contentContainerStyle={{ gap: 25 }}>
        <View className="gap-4">
          <View className="gap-[30px]">
            <View className="items-center gap-1">
              <Text className="text-gray-1000 font-label-16-semibold">내 ALL에 저장</Text>
              <Text className="text-center text-gray-700 font-b3">
                작성자가 저장한 정보를 그대로 불러왔습니다.{"\n"}필요한 내용을 수정해 주세요.
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
                    // TODO: 이미지 피커 연결.
                    onPress={() => {}}
                  >
                    <CameraSvg width={14} height={12} color={colors.gray[900]} />
                  </Pressable>
                </View>
              </View>

              <View className="gap-2">
                <Text className="text-gray-900 font-b3">아이템명</Text>
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
                <Text className="text-gray-900 font-b3">아이템 링크</Text>
                <TextField value={values.sourceUrl} onChangeText={update("sourceUrl")} />
              </View>
            </View>
          </View>

          <View className="h-8 flex-row items-center justify-between">
            <Text className="text-gray-900 font-b3">위시레벨</Text>
            <View className="items-end" style={{ zIndex: isLevelOpen ? 10 : undefined }}>
              {isLevelOpen ? (
                <View className="absolute bottom-10 right-0 items-start gap-2">
                  {LEVEL_KEYS.map((key) => (
                    <Pressable
                      key={key}
                      accessibilityRole="menuitem"
                      accessibilityLabel={WISH_LEVEL_LABELS[key]}
                      className="flex-row items-center gap-2 rounded-full border border-gray-200 bg-gray-0 px-3 py-2 active:opacity-75"
                      style={LEVEL_MENU_SHADOW}
                      onPress={() => {
                        update("wishLevel")(key);
                        setLevelOpen(false);
                      }}
                    >
                      <View
                        className={clsx("size-2 rounded-full", WISH_LEVEL_DOT_CLASSNAMES[key])}
                      />
                      <Text className="text-gray-1000 font-b3">{WISH_LEVEL_LABELS[key]}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`위시레벨 ${values.wishLevel ? WISH_LEVEL_LABELS[values.wishLevel] : "미선택"}`}
                accessibilityState={{ expanded: isLevelOpen }}
                className="h-8 flex-row items-center justify-center gap-2 rounded-full border border-gray-300 bg-gray-0 px-3 active:opacity-75"
                onPress={() => setLevelOpen((prev) => !prev)}
              >
                {values.wishLevel ? (
                  <View className="flex-row items-center gap-1">
                    <View
                      className={clsx(
                        "size-2 rounded-full",
                        WISH_LEVEL_DOT_CLASSNAMES[values.wishLevel],
                      )}
                    />
                    <Text className="text-gray-1000 font-b3">
                      {WISH_LEVEL_LABELS[values.wishLevel]}
                    </Text>
                  </View>
                ) : (
                  <Text className="text-gray-900 font-label-14">미선택</Text>
                )}
                {/* 목록이 위로 열리므로 닫혔을 때 위쪽, 열렸을 때 아래쪽을 가리킴 */}
                <View
                  className="size-4 items-center justify-center"
                  style={{ transform: [{ rotate: isLevelOpen ? "0deg" : "180deg" }] }}
                >
                  <ChevronSvg width={12} height={12} color={colors.gray[900]} />
                </View>
              </Pressable>
            </View>
          </View>
        </View>

        <View className="flex-row justify-between">
          <Button className="w-[155px]" variant="secondary" onPress={onRequestClose}>
            취소
          </Button>
          <Button className="w-[155px]" onPress={onNext}>
            폴더 선택하기
          </Button>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
