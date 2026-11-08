import { Text, View } from "react-native";

import { IconToastError, IconToastNotice, IconToastSuccess } from "@/assets/images/toast";

export type ToastVariant = "default" | "success" | "error" | "notice";

const ICONS = { success: IconToastSuccess, error: IconToastError, notice: IconToastNotice };

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
      className="max-w-[327px] flex-row items-center gap-2 rounded bg-semantic-toast p-3"
    >
      {Icon && (
        <View className="size-4 shrink-0">
          <Icon />
        </View>
      )}
      <Text
        accessibilityLabel={message}
        className={`shrink text-gray-0 font-label-14 ${Icon ? "text-left" : "text-center"}`}
        lineBreakStrategyIOS="hangul-word"
        style={{ includeFontPadding: false }}
      >
        {/* Android에서도 한글 단어 내부의 줄바꿈을 막는다. */}
        {message.replace(/([가-힣])(?=[가-힣])/gu, "$1\u2060")}
      </Text>
    </View>
  );
}
