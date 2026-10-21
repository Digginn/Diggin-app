import { Text, View } from "react-native";

import { IconToastError, IconToastNotice, IconToastSuccess } from "@/assets/images/toast";
import { colors } from "@/theme";

export type ToastVariant = "default" | "success" | "error" | "notice";

const ICONS = { success: IconToastSuccess, error: IconToastError, notice: IconToastNotice };

type ToastTextProps = {
  message: string;
  variant?: ToastVariant;
};

export function ToastText({ message, variant = "default" }: ToastTextProps) {
  const Icon = variant === "default" ? null : ICONS[variant];
  const foreground = variant === "error" ? colors.semantic["error-on-dark"] : colors.gray[200];
  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={`max-w-[327px] flex-row gap-2 rounded bg-semantic-toast p-3 ${variant === "error" ? "items-start" : "items-center"}`}
    >
      {Icon && (
        <View className="size-4 shrink-0">
          <Icon
            color={
              variant === "notice"
                ? colors.gray[0]
                : variant === "error"
                  ? foreground
                  : colors.gray[800]
            }
            fill={
              variant === "notice"
                ? colors.gray[0]
                : variant === "error"
                  ? colors.gray[700]
                  : colors.gray[200]
            }
          />
        </View>
      )}
      <Text
        className={`shrink font-label-14 ${variant === "error" ? "text-semantic-error-on-dark" : variant === "notice" ? "text-gray-0" : "text-gray-200"} ${Icon ? "text-left" : "text-center"}`}
        lineBreakStrategyIOS="hangul-word"
        style={{ includeFontPadding: false }}
      >
        {message}
      </Text>
    </View>
  );
}
