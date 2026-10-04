import { Text, View } from "react-native";

export function FolderToast({ message }: { message: string }) {
  return (
    <View pointerEvents="none" className="w-full items-center px-margin">
      <View className="max-w-[327px] rounded border border-gray-800 bg-gray-700 p-3">
        <Text accessibilityLiveRegion="polite" className="text-center text-gray-200 font-label-14">
          {message}
        </Text>
      </View>
    </View>
  );
}
