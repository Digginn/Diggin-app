import { Pressable } from "react-native";

import WriteSvg from "@/assets/images/icon-write.svg";
import { colors } from "@/theme";

const ICON_SIZE = 24;

type FabProps = {
  accessibilityLabel: string;
  onPress: () => void;
};

export function Fab({ accessibilityLabel, onPress }: FabProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="size-[54px] items-center justify-center rounded-full bg-gray-900 active:opacity-75"
      style={{ boxShadow: `0px 4px 10px ${colors.gray[1000]}1A` }}
      onPress={onPress}
    >
      <WriteSvg width={ICON_SIZE} height={ICON_SIZE} color={colors.gray[50]} />
    </Pressable>
  );
}
