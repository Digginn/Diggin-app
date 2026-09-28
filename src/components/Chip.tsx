import { clsx } from "clsx";
import { cssInterop } from "nativewind";
import { Pressable, Text } from "react-native";

import IconChevronRaw from "@/assets/images/icon-chevron.svg";

const IconChevron = cssInterop(IconChevronRaw, {
  className: { target: false, nativeStyleToProp: { color: true } },
});

const CHEVRON_SIZE = 8;

export type ChipColor = "black" | "white";

type ChipProps = {
  label: string;
  color?: ChipColor;
  isOpen?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  className?: string;
};

export function Chip({
  label,
  color = "black",
  isOpen = false,
  onPress,
  accessibilityLabel,
  className,
}: ChipProps) {
  const isBlack = color === "black";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ expanded: isOpen }}
      className={clsx(
        "h-7 flex-row items-center gap-2 rounded-full px-3 active:opacity-75",
        isBlack ? "bg-gray-900" : "bg-gray-0",
        className,
      )}
    >
      <Text className={clsx("font-label-12-semibold", isBlack ? "text-gray-0" : "text-gray-900")}>
        {label}
      </Text>
      <IconChevron
        width={CHEVRON_SIZE}
        height={CHEVRON_SIZE}
        className={isBlack ? "text-gray-0" : "text-gray-900"}
        style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}
      />
    </Pressable>
  );
}
