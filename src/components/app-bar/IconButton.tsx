import { Pressable, type PressableProps } from "react-native";

import type { SvgIcon } from "@/assets/images/appbar";

type IconButtonProps = Omit<PressableProps, "children"> & {
  icon: SvgIcon;
  accessibilityLabel: string;
  className?: string;
};

export function IconButton({ icon: Icon, className = "text-gray-900", ...rest }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      className="size-[48px] items-center justify-center"
    >
      <Icon width={48} height={48} className={className} />
    </Pressable>
  );
}
