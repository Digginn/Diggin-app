import { clsx } from "clsx";
import { cssInterop } from "nativewind";
import { Pressable, Text } from "react-native";

import ChevronTopSvg from "@/assets/images/icon-chevron-top.svg";

const ChevronIcon = cssInterop(ChevronTopSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

type WishLevelSelectProps = {
  label: string;
  isOpen?: boolean;
  onPress: () => void;
  className?: string;
};

export function WishLevelSelect({
  label,
  isOpen = false,
  onPress,
  className,
}: WishLevelSelectProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`위시 레벨 ${label}`}
      accessibilityState={{ expanded: isOpen }}
      className={clsx(
        "h-8 flex-row items-center justify-center gap-2 rounded-full border border-gray-300 bg-gray-0 px-3 active:opacity-75",
        className,
      )}
      onPress={onPress}
    >
      <Text className="text-gray-900 font-label-14">{label}</Text>
      <ChevronIcon
        className="size-4"
        style={{ transform: [{ rotate: isOpen ? "0deg" : "180deg" }] }}
      />
    </Pressable>
  );
}
