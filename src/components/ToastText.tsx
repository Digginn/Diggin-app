import { Text, View } from "react-native";

import { IconToastError, IconToastSuccess } from "@/assets/images/toast";

export type ToastVariant = "default" | "success" | "error";

const ICONS = { success: IconToastSuccess, error: IconToastError };

type ToastTextProps = {
  message: string;
  variant?: ToastVariant;
};

export function ToastText({ message, variant = "default" }: ToastTextProps) {
  const Icon = variant === "default" ? null : ICONS[variant];
  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="max-w-full flex-row items-center gap-2 rounded bg-gray-700/[0.92] p-3"
    >
      {Icon && (
        <View className="size-4 shrink-0">
          <Icon />
        </View>
      )}
      <Text
        className={`shrink text-gray-0 font-label-14 ${Icon ? "text-left" : "text-center"}`}
        lineBreakStrategyIOS="hangul-word"
        style={{ includeFontPadding: false }}
      >
        {message}
      </Text>
    </View>
  );
}
