import { Text, View } from "react-native";

import EmptyAll from "@/assets/images/empty-all.svg";

const IMAGE_SIZE = 96;

type EmptyStateProps = {
  message: string;
};

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center gap-2">
      <EmptyAll width={IMAGE_SIZE} height={IMAGE_SIZE} />
      <Text className="text-center text-gray-500 font-b1">{message}</Text>
    </View>
  );
}
