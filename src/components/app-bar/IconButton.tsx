import { Pressable, type PressableProps } from "react-native";

import type { SvgIcon } from "@/assets/images/appbar";

type IconButtonProps = Omit<PressableProps, "children"> & {
  icon: SvgIcon;
  iconSize?: number;
  accessibilityLabel: string;
  className?: string;
};

export function IconButton({
  icon: Icon,
  iconSize = 48,
  className = "text-gray-900",
  ...rest
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      className="size-[48px] items-center justify-center"
    >
      <Icon width={iconSize} height={iconSize} className={className} />
    </Pressable>
  );
}
