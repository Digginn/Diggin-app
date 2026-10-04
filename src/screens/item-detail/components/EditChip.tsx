import { cssInterop } from "nativewind";
import { Pressable, Text } from "react-native";

import EditSvg from "@/assets/images/icon-edit.svg";

const EditIcon = cssInterop(EditSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

type EditChipProps = {
  onPress: () => void;
};

export function EditChip({ onPress }: EditChipProps) {
  return (
    <Pressable
      accessibilityLabel="아이템 정보 수정"
      accessibilityRole="button"
      className="w-[70px] flex-row items-center gap-0.5 rounded-field bg-gray-100 py-1 pl-1.5 pr-2 active:opacity-75"
      hitSlop={{ top: 12, bottom: 12 }}
      onPress={onPress}
    >
      <EditIcon className="size-[14px]" />
      <Text className="text-gray-700 font-tag">수정하기</Text>
    </Pressable>
  );
}
