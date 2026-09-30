import { Text, View } from "react-native";

import EmptyAll from "@/assets/images/empty-all.svg";

const IMAGE_SIZE = 96;

export function AllEmpty() {
  return (
    <View className="flex-1 items-center justify-center gap-2">
      <EmptyAll width={IMAGE_SIZE} height={IMAGE_SIZE} />
      <Text className="text-center text-gray-500 font-b1">
        아직 저장된 아이템이 없습니다.{"\n"}관심 아이템의 링크를 복사해 보세요.
      </Text>
    </View>
  );
}
