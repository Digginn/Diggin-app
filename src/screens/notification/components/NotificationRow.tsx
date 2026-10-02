import { clsx } from "clsx";
import { Pressable, Text, View } from "react-native";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  timeLabel: string;
  isRead: boolean;
};

type NotificationRowProps = {
  notification: NotificationItem;
  onPress?: () => void;
};

export function NotificationRow({ notification, onPress }: NotificationRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}, ${notification.timeLabel}, ${notification.message}`}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      className={clsx(
        "gap-1 border-b border-gray-200 px-margin py-4",
        notification.isRead ? "bg-gray-0" : "bg-gray-50",
        onPress && "active:opacity-75",
      )}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="min-w-0 flex-1 text-gray-900 font-label-14">{notification.title}</Text>
        <Text className="shrink-0 text-gray-500 font-meta">{notification.timeLabel}</Text>
      </View>
      <Text className="text-gray-700 font-b4">{notification.message}</Text>
    </Pressable>
  );
}
