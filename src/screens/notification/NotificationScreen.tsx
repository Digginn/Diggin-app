import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import EmptyNotification from "@/assets/images/image-empty-notification.svg";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";

import { NotificationRow, type NotificationItem } from "./components/NotificationRow";
import { NotificationSkeleton } from "./components/NotificationSkeleton";
import { PushOffBanner } from "./components/PushOffBanner";

const BANNER_DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

type NotificationScreenProps = {
  onBack?: () => void;
  notifications?: NotificationItem[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onPressNotification?: (notification: NotificationItem) => void;
  isDevicePushEnabled?: boolean;
  bannerDismissedUntil?: number;
  onDismissPushBanner?: (dismissedUntil: number) => void;
  onOpenNotificationSettings?: () => void;
};

export function NotificationScreen({
  onBack,
  notifications = [],
  isLoading = false,
  isError = false,
  onRetry,
  onPressNotification,
  isDevicePushEnabled = true,
  bannerDismissedUntil = 0,
  onDismissPushBanner,
  onOpenNotificationSettings,
}: NotificationScreenProps = {}) {
  const [localDismissedUntil, setLocalDismissedUntil] = useState(0);
  const [openedAt] = useState(Date.now);
  const canShowPushBanner =
    !isDevicePushEnabled && Math.max(bannerDismissedUntil, localDismissedUntil) <= openedAt;
  const pushBanner = canShowPushBanner ? (
    <PushOffBanner
      onOpenSettings={onOpenNotificationSettings}
      onClose={() => {
        const dismissedUntil = Date.now() + BANNER_DISMISS_DURATION_MS;
        setLocalDismissedUntil(dismissedUntil);
        onDismissPushBanner?.(dismissedUntil);
      }}
    />
  ) : null;
  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <AppBar title="알림" onBack={onBack} />
      {isLoading ? (
        <SafeAreaView edges={["bottom"]} className="flex-1">
          <NotificationSkeleton />
        </SafeAreaView>
      ) : isError ? (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="box-none">
          <View className="items-center gap-6 px-margin">
            <Text className="text-center text-gray-500 font-b1">
              네트워크 연결을 확인해 주세요.
            </Text>
            <View className="w-[156px]">
              <Button onPress={() => onRetry?.()} isDisabled={!onRetry}>
                다시 시도
              </Button>
            </View>
          </View>
        </View>
      ) : notifications.length > 0 ? (
        <SafeAreaView edges={["bottom"]} className="flex-1">
          <FlatList
            ListHeaderComponent={pushBanner}
            data={notifications}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <NotificationRow
                notification={item}
                onPress={onPressNotification ? () => onPressNotification(item) : undefined}
              />
            )}
          />
        </SafeAreaView>
      ) : (
        <>
          {pushBanner}
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <View className="items-center gap-2">
              <EmptyNotification />
              <Text className="text-center text-gray-500 font-b1">
                아직 표시할 내용이 없습니다.
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
