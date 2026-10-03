import { Text, View } from "react-native";

import { IconToastError } from "@/assets/images/toast";

export type ToastVariant = "default" | "error";

type ToastTextProps = {
  message: string;
  variant?: ToastVariant;
};

export function ToastText({ message, variant = "default" }: ToastTextProps) {
  const isError = variant === "error";
  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={`max-w-full rounded border p-3 ${isError ? "flex-row items-start gap-2 border-semantic-errorOnDark bg-semantic-errorBgDark" : "items-center justify-center border-gray-800 bg-gray-700"}`}
    >
      {isError && (
        <View className="mt-[2.5px] size-4 shrink-0">
          <IconToastError />
        </View>
      )}
      <Text
        className={`font-label-14 ${isError ? "shrink text-left text-semantic-errorOnDark" : "text-center text-gray-200"}`}
        lineBreakStrategyIOS="hangul-word"
        style={{ includeFontPadding: false }}
      >
        {message}
      </Text>
    </View>
  );
}
