import { ScrollView, Text, View } from "react-native";

import { ToastText } from "@/components/ToastText";
import { TOAST_MESSAGES } from "@/constants/messages";

export default function ToastPreview() {
  return (
    <ScrollView className="flex-1 bg-gray-0" contentContainerClassName="gap-8 px-margin py-16">
      <Text className="text-gray-900 font-h2">ToastText</Text>
      <View className="items-center gap-6">
        <ToastText message="아이템을 저장했습니다." />
        <ToastText message="내가 만든 투표에는 참여할 수 없습니다. 다른 사용자의 투표에는 BUY 또는 NOT으로 참여할 수 있습니다." />
        <ToastText message="아이템을 저장했습니다." variant="success" />
        <ToastText message={TOAST_MESSAGES.FILE_INVALID} variant="error" />
      </View>
    </ScrollView>
  );
}
