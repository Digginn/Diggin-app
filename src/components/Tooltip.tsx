import { Image } from "expo-image";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

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

export function Tooltip({ message, onClose, arrowPosition = "top", className }: TooltipProps) {
  const assets = tooltipAssets[arrowPosition];
  const isAndroid = Platform.OS === "android";

  return (
    <View
      className={`relative min-h-14 min-w-28 max-w-[193px] justify-center self-start px-8 ${isAndroid ? "py-4" : "py-[18px]"} ${className ?? ""}`}
    >
      <View className="absolute inset-0 rounded-lg bg-gray-1000" pointerEvents="none" />
      <Image
        pointerEvents="none"
        source={assets.arrow}
        style={arrowPosition === "top" ? styles.topArrow : styles.leftArrow}
      />
      <Text
        className={`text-gray-0 font-b4 ${isAndroid ? "min-h-6" : ""}`}
        style={isAndroid ? styles.androidText : undefined}
      >
        {message}
      </Text>
      <Pressable
        accessibilityLabel="툴팁 닫기"
        accessibilityRole="button"
        className="absolute size-12 items-center justify-center"
        onPress={onClose}
        style={styles.closeButton}
      >
        <Image source={assets.close} style={styles.closeIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  androidText: {
    lineHeight: 20,
    textAlignVertical: "center",
  },
  topArrow: {
    height: 10.5,
    position: "absolute",
    right: 25,
    top: -10.5,
    width: 13.8564,
  },
  leftArrow: {
    height: 10.5,
    left: -10,
    position: "absolute",
    top: 12,
    transform: [{ rotate: "-90deg" }],
    width: 13.8564,
  },
  closeButton: {
    right: -10,
    top: -10,
  },
  closeIcon: {
    height: 12,
    width: 12,
  },
});
