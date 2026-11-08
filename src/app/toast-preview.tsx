import { ScrollView, Text, View } from "react-native";

import { ToastText } from "@/components/ToastText";
import { DIGGLE_TOAST_MESSAGES, TOAST_MESSAGES } from "@/constants/messages";

export default function ToastPreview() {
  return (
    <ScrollView className="flex-1 bg-gray-0" contentContainerClassName="gap-8 px-margin py-16">
      <Text className="text-gray-900 font-h2">ToastText</Text>
      <View className="items-center gap-6">
        <ToastText message="토스트 문구입니다." />
        <ToastText message="토스트 문구입니다." variant="success" />
        <ToastText message="토스트 문구입니다." variant="error" />
        <ToastText message="내가 만든 투표에는 참여할 수 없습니다. 다른 사용자의 투표에는 BUY 또는 NOT으로 참여할 수 있습니다." />
        <ToastText message={DIGGLE_TOAST_MESSAGES.VOTE_009} variant="success" />
        <ToastText message={TOAST_MESSAGES.FILE_INVALID} variant="error" />
        <ToastText message="커뮤니티 이용이 제한되었습니다." variant="notice" />
      </View>
    </ScrollView>
  );
}
