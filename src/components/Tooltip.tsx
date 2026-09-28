import { Platform, Pressable, Text, View } from "react-native";

import IconArrowLeft from "@/assets/images/icon-tooltip-arrow-left.svg";
import IconArrowTop from "@/assets/images/icon-tooltip-arrow-top.svg";
import IconCloseLeft from "@/assets/images/icon-tooltip-close-left.svg";
import IconCloseTop from "@/assets/images/icon-tooltip-close-top.svg";

type TooltipArrowPosition = "left" | "top";

type TooltipProps = {
  message: string;
  onClose: () => void;
  arrowPosition?: TooltipArrowPosition;
  className?: string;
};

const ARROW_WIDTH = 13.8564;
const ARROW_HEIGHT = 10.5;
const CLOSE_SIZE = 12;

const tooltipIcons = {
  left: { Arrow: IconArrowLeft, Close: IconCloseLeft },
  top: { Arrow: IconArrowTop, Close: IconCloseTop },
} as const;

export function Tooltip({ message, onClose, arrowPosition = "top", className }: TooltipProps) {
  const { Arrow, Close } = tooltipIcons[arrowPosition];
  const isAndroid = Platform.OS === "android";

  return (
    <View
      className={`relative min-h-14 min-w-28 max-w-[193px] justify-center self-start px-8 ${isAndroid ? "py-4" : "py-[18px]"} ${className ?? ""}`}
    >
      <View className="absolute inset-0 rounded-lg bg-gray-1000" pointerEvents="none" />
      <View
        pointerEvents="none"
        className={
          arrowPosition === "top" ? "absolute -top-2.5 right-[25px]" : "absolute left-[-10px] top-3"
        }
        style={arrowPosition === "left" ? { transform: [{ rotate: "-90deg" }] } : undefined}
      >
        <Arrow width={ARROW_WIDTH} height={ARROW_HEIGHT} />
      </View>
      <Text
        className={`text-gray-0 font-b4 ${isAndroid ? "min-h-6 leading-5" : ""}`}
        style={isAndroid ? { textAlignVertical: "center" } : undefined}
      >
        {message}
      </Text>
      <Pressable
        accessibilityLabel="툴팁 닫기"
        accessibilityRole="button"
        className="absolute -right-2.5 -top-2.5 size-12 items-center justify-center"
        onPress={onClose}
      >
        <Close width={CLOSE_SIZE} height={CLOSE_SIZE} />
      </Pressable>
    </View>
  );
}
