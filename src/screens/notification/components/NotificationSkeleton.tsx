import { ScrollView, View } from "react-native";

const SKELETON_ROW_COUNT = 4;

export function NotificationSkeleton() {
  return (
    <ScrollView
      accessible
      accessibilityLabel="알림을 불러오는 중입니다"
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <View key={index} className="gap-2 px-margin py-5">
          <View className="flex-row items-center justify-between">
            <View className="h-4 w-[140px] rounded bg-gray-skeleton" />
            <View className="h-3 w-10 rounded bg-gray-skeleton" />
          </View>
          <View className="h-3.5 w-full rounded bg-gray-skeleton" />
          <View className="h-3.5 w-[200px] max-w-full rounded bg-gray-skeleton" />
        </View>
      ))}
    </ScrollView>
  );
}
