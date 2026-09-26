import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { Platform, Pressable, Text, View } from "react-native";

type TooltipArrowPosition = "left" | "top";

type TooltipProps = {
  message: string;
  onClose: () => void;
  arrowPosition?: TooltipArrowPosition;
  className?: string;
};

const tooltipAssets = {
  left: {
    arrow: require("@/assets/images/icon-tooltip-arrow-left.svg"),
    close: require("@/assets/images/icon-tooltip-close-left.svg"),
  },
  top: {
    arrow: require("@/assets/images/icon-tooltip-arrow-top.svg"),
    close: require("@/assets/images/icon-tooltip-close-top.svg"),
  },
} as const;

const StyledImage = cssInterop(Image, { className: "style" });

export function Tooltip({ message, onClose, arrowPosition = "top", className }: TooltipProps) {
  const assets = tooltipAssets[arrowPosition];
  const isAndroid = Platform.OS === "android";

  return (
    <View
      className={`relative min-h-14 min-w-28 max-w-[193px] justify-center self-start px-8 ${isAndroid ? "py-4" : "py-[18px]"} ${className ?? ""}`}
    >
      <View className="absolute inset-0 rounded-lg bg-gray-1000" pointerEvents="none" />
      <StyledImage
        pointerEvents="none"
        source={assets.arrow}
        className={
          arrowPosition === "top"
            ? "absolute right-[25px] top-[-10.5px] h-[10.5px] w-[13.8564px]"
            : "absolute left-[-10px] top-3 h-[10.5px] w-[13.8564px] -rotate-90"
        }
      />
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
        <StyledImage source={assets.close} className="size-3" />
      </Pressable>
    </View>
  );
}
