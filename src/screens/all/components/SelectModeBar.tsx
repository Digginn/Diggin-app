import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BAR_HEIGHT = 56;
const SIDE_SLOT = 80;
const TOUCH_HEIGHT = 44;

type SelectModeBarProps = {
  selectedCount: number;
  isAllSelected: boolean;
  onCancel: () => void;
  onToggleAll: () => void;
};

export function SelectModeBar({
  selectedCount,
  isAllSelected,
  onCancel,
  onToggleAll,
}: SelectModeBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="bg-gray-0" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4" style={{ height: BAR_HEIGHT }}>
        <Pressable
          accessibilityRole="button"
          className="justify-center active:opacity-75"
          style={{ width: SIDE_SLOT, height: TOUCH_HEIGHT }}
          onPress={onCancel}
        >
          <Text className="text-gray-900 font-label-16-medium">취소</Text>
        </Pressable>

        {/* 선택 개수는 좌우 슬롯 폭이 같아야 바 정가운데에 온다. */}
        <Text className="flex-1 text-center text-gray-900 font-label-16-semibold">
          {selectedCount}개 선택
        </Text>

        <Pressable
          accessibilityRole="button"
          className="items-end justify-center active:opacity-75"
          style={{ width: SIDE_SLOT, height: TOUCH_HEIGHT }}
          onPress={onToggleAll}
        >
          <Text className="text-gray-900 font-label-16-medium">
            {isAllSelected ? "전체 해제" : "전체 선택"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
