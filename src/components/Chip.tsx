import { clsx } from "clsx";
import { cssInterop } from "nativewind";
import { Pressable, Text, View } from "react-native";

import ChevronSvg from "@/assets/images/icon-chevron.svg";

const ChevronIcon = cssInterop(ChevronSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true, color: true } },
});

export type ChipColor = "black" | "white";

type ChipProps = {
  label: string;
  color?: ChipColor;
  isOpen?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  className?: string;
  isDisabled?: boolean;
};

export function Chip({
  label,
  color = "black",
  isOpen = false,
  onPress,
  accessibilityLabel,
  className,
  isDisabled = false,
}: ChipProps) {
  const isBlack = color === "black";
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ expanded: isOpen, disabled: isDisabled }}
      className={clsx(
        "h-7 flex-row items-center gap-2 rounded-full px-3 active:opacity-75",
        isBlack ? "bg-gray-900" : "bg-gray-0",
        className,
      )}
    >
      <Text className={clsx("font-label-12-semibold", isBlack ? "text-gray-0" : "text-gray-900")}>
        {label}
      </Text>
      <View className="size-2" style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}>
        <ChevronIcon className={clsx("size-2", isBlack ? "text-gray-0" : "text-gray-900")} />
      </View>
    </Pressable>
  );
}
