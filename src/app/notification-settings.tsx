import { useEffect, useState } from "react";
import { Alert, AppState, Linking, Platform } from "react-native";

import { NotificationSettingsScreen } from "@/screens/my/NotificationSettingsScreen";

export default function NotificationSettingsRoute() {
  const [isDevicePushEnabled, setIsDevicePushEnabled] = useState<boolean>();

  useEffect(() => {
    if (Platform.OS === "web") return;
    let isMounted = true;
    let latestRequest = 0;
    const refreshPermission = async () => {
      const request = ++latestRequest;
      try {
        const Notifications = await import("expo-notifications");
        const permission = await Notifications.getPermissionsAsync();
        if (isMounted && request === latestRequest) {
          setIsDevicePushEnabled(
            permission.granted ||
              permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
              permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL,
          );
        }
      } catch (error) {
        console.warn("기기 알림 권한을 확인하지 못했습니다.", error);
      }
    };
    void refreshPermission();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshPermission();
    });
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return (
    <NotificationSettingsScreen
      isDevicePushEnabled={isDevicePushEnabled}
      onOpenNotificationSettings={() => {
        Linking.openSettings().catch(() =>
          Alert.alert("설정을 열지 못했습니다", "기기 설정에서 앱 알림을 허용해 주세요."),
        );
      }}
    />
  );
}
