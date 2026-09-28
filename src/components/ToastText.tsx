import { Text, View } from "react-native";

type ToastTextProps = {
  message: string;
};

export function ToastText({ message }: ToastTextProps) {
  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="max-w-full items-center justify-center rounded border border-gray-800 bg-gray-700 p-3"
    >
      <Text
        className="text-center text-gray-200 font-label-14"
        style={{ includeFontPadding: false }}
      >
        {message}
      </Text>
    </View>
  );
}
