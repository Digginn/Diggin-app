import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { Pressable, Text, View } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";

const StyledImage = cssInterop(Image, { className: "style" });

type PostItemInfoSheetProps = {
  visible: boolean;
  brand: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  onOpenWebsite: () => void;
  onSaveToAll: () => void;
  onRequestClose: () => void;
};

export function PostItemInfoSheet({
  visible,
  brand,
  name,
  price,
  imageUrl,
  onOpenWebsite,
  onSaveToAll,
  onRequestClose,
}: PostItemInfoSheetProps) {
  return (
    <BottomSheet visible={visible} isGrabberVisible={false} onRequestClose={onRequestClose}>
      <View className="w-full items-start gap-4 px-margin pt-7">
        <View className="w-full flex-row items-start gap-[14px]">
          <StyledImage
            className="size-[72px] rounded-lg bg-gray-200"
            contentFit="cover"
            source={imageUrl ?? undefined}
          />
          <View className="min-w-0 flex-1 items-start gap-1">
            <Text className="text-gray-500 font-note" numberOfLines={1}>
              {brand}
            </Text>
            <Text className="text-gray-900 font-b2" numberOfLines={1}>
              {name}
            </Text>
            <Text className="text-gray-900 font-label-16-bold">
              {price.toLocaleString("ko-KR")}원
            </Text>
          </View>
        </View>

        <Text className="w-full text-gray-500 font-label-12-regular">
          작성자가 저장한 시점의 정보입니다. 실제 가격과 다를 수 있습니다.
        </Text>

        <View className="w-full flex-row items-start gap-3">
          <Pressable
            accessibilityRole="button"
            className="h-[52px] flex-1 items-center justify-center overflow-hidden rounded-lg bg-gray-100 active:opacity-75"
            onPress={onOpenWebsite}
          >
            <Text className="text-gray-900 font-label-16-semibold">웹사이트 이동</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            className="h-[52px] flex-1 items-center justify-center overflow-hidden rounded-lg bg-gray-900 active:opacity-75"
            onPress={onSaveToAll}
          >
            <Text className="text-gray-0 font-label-16-semibold">내 ALL에 저장</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
