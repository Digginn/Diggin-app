import clsx from "clsx";
import { Image } from "expo-image";
import { Pressable, Text } from "react-native";

import chevronIcon from "../../assets/images/icon-chevron.svg";
import { colors } from "@/theme";

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
        "flex-row items-center h-7 px-3 rounded-full gap-2 active:opacity-75",
        isBlack ? "bg-gray-900" : "bg-gray-0",
        className,
      )}
    >
      <Text
        className={clsx(
          "font-label-12-semibold",
          isBlack ? "text-gray-0" : "text-gray-900",
        )}
      >
        {label}
      </Text>
      <Image
        source={chevronIcon}
        style={{
          width: 8,
          height: 8,
          transform: [{ rotate: isOpen ? "180deg" : "0deg" }],
        }}
        tintColor={isBlack ? colors.gray[0] : colors.gray[900]}
      />
    </Pressable>
  );
}
