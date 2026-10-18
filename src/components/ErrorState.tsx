import { Text, View } from "react-native";

import { Button } from "@/components/Button";

type ErrorStateProps = {
  message: string;
  onRetry: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View className="flex-1 items-center justify-center gap-6">
      <Text className="text-center text-gray-500 font-b1">{message}</Text>
      {/* Button은 self-stretch라 폭만 주면 왼쪽에 붙는다. 156 틀 안에 넣어 가운데에 둔다. */}
      <View className="w-[156px]">
        <Button onPress={onRetry}>다시 시도</Button>
      </View>
    </View>
  );
}
