import clsx from "clsx";
import { Image } from "expo-image";
import { Pressable, Text } from "react-native";

import closeIcon from "../../assets/images/icon-close.svg";
import { colors } from "@/theme";

type TagProps = {
  label: string;
  isActive?: boolean;
  onClose?: () => void;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export function Tag({
  label,
  isActive = false,
  onClose,
  onPress,
  accessibilityLabel,
}: TagProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={accessibilityLabel ?? label}
      className={clsx(
        "flex-row items-center h-7 rounded-full border",
        onPress && "active:opacity-75",
        isActive ? "bg-gray-900 border-gray-900" : "bg-gray-0 border-gray-400",
        !isActive && onClose ? "pl-3" : "px-3",
      )}
    >
      <Text
        className={clsx(
          "font-label-12-semibold",
          isActive ? "text-gray-200" : "text-gray-500",
        )}
      >
        {label}
      </Text>
      {!isActive && onClose && (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`${label} 삭제`}
          className="self-stretch justify-center pl-1 pr-2 active:opacity-75"
        >
          <Image
            source={closeIcon}
            style={{ width: 16, height: 16 }}
            tintColor={colors.gray[500]}
          />
        </Pressable>
      )}
    </Pressable>
  );
}
