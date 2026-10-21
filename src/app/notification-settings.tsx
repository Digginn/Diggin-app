import { useEffect, useState } from "react";
import { Alert, AppState, Linking, Platform } from "react-native";

import { NotificationSettingsScreen } from "@/screens/my/NotificationSettingsScreen";
import { usePushSetting } from "@/screens/my/queries/usePushSetting";

export default function NotificationSettingsRoute() {
  const [isDevicePushEnabled, setIsDevicePushEnabled] = useState<boolean>();
  const pushSetting = usePushSetting();

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
      // 저장된 값을 받으면 화면을 다시 만들어 토글 초기값으로 쓴다.
      key={pushSetting.isLoaded ? "loaded" : "loading"}
      initialSettings={pushSetting.settings}
      onSaveSettings={pushSetting.save}
      isDevicePushEnabled={isDevicePushEnabled}
      onOpenNotificationSettings={() => {
        Linking.openSettings().catch(() =>
          Alert.alert("설정을 열지 못했습니다", "기기 설정에서 앱 알림을 허용해 주세요."),
        );
      }}
    />
  );
}
