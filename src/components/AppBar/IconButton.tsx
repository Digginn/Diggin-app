import { Pressable } from "react-native";

import type { SvgIcon } from "@/assets/images/appbar";

type IconButtonProps = {
  icon: SvgIcon;
  accessibilityLabel: string;
  onPress: () => void;
  className?: string;
};

export function IconButton({
  icon: Icon,
  accessibilityLabel,
  onPress,
  className = "text-gray-900",
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="size-[48px] items-center justify-center"
    >
      <Icon width={48} height={48} className={className} />
    </Pressable>
  );
}
