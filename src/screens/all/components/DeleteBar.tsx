import { View } from "react-native";

import { Button } from "@/components/Button";

type DeleteBarProps = {
  selectedCount: number;
  onPress: () => void;
};

export function DeleteBar({ selectedCount, onPress }: DeleteBarProps) {
  const isEmpty = selectedCount === 0;

  return (
    <View className="border-t border-gray-200 bg-gray-0 px-6 pb-10 pt-3">
      <Button size="large" isDisabled={isEmpty} onPress={onPress}>
        {isEmpty ? "삭제" : `${selectedCount}개 삭제`}
      </Button>
    </View>
  );
}
