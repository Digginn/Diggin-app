import { clsx } from "clsx";
import { Pressable, Text } from "react-native";

import IconClose from "@/assets/images/icon-close.svg";

const CLOSE_SIZE = 16;

type TagProps = {
  label: string;
  isActive?: boolean;
  onClose?: () => void;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export function Tag({ label, isActive = false, onClose, onPress, accessibilityLabel }: TagProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={accessibilityLabel ?? label}
      className={clsx(
        "h-7 flex-row items-center rounded-full border",
        onPress && "active:opacity-75",
        isActive ? "border-gray-900 bg-gray-900" : "border-gray-400 bg-gray-0",
        !isActive && onClose ? "pl-3" : "px-3",
      )}
    >
      <Text
        className={clsx("font-label-12-semibold", isActive ? "text-gray-200" : "text-gray-500")}
      >
        {label}
      </Text>
      {!isActive && onClose && (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`${label} 삭제`}
          className="justify-center self-stretch pl-1 pr-2 active:opacity-75"
        >
          <IconClose width={CLOSE_SIZE} height={CLOSE_SIZE} />
        </Pressable>
      )}
    </Pressable>
  );
}
