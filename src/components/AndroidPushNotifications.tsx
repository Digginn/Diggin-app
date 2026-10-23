import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { notificationKeys } from "@/screens/notification/api/notifications";

/** 콜드 스타트와 실행 중 알림 선택을 같은 경로로 처리한다. 외부 URL은 이동 대상으로 받지 않는다. */
export function AndroidPushNotifications() {
  const { session, isRestoring } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android" || isRestoring) return;
    let isActive = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    const handle = (response: Notifications.NotificationResponse) => {
      if (!isActive || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
        return;
      const request = response.notification.request;
      if (lastHandled.current === request.identifier) return;
      lastHandled.current = request.identifier;
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      const data = request.content.data ?? {};
      // 다른 계정으로 도착한 알림은 계정 전환 뒤 상세를 열지 않는다.
      if (userId && typeof data.recipient_id === "string" && data.recipient_id !== userId) return;
      if (
        !userId ||
        data.recipient_id !== userId ||
        typeof data.post_id !== "string" ||
        !/^[1-9]\d*$/.test(data.post_id) ||
        (data.post_type !== "post" && data.post_type !== "vote")
      ) {
        router.push("/notifications");
        return;
      }
      router.push({
        pathname: data.post_type === "vote" ? "/votes/[id]" : "/posts/[id]",
        params: { id: data.post_id },
      });
    };
    const responseListener = Notifications.addNotificationResponseReceivedListener(handle);
    const receiveListener = Notifications.addNotificationReceivedListener(() => {
      if (isActive && userId)
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    });
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handle(response);
      })
      .catch(() => {});
    return () => {
      isActive = false;
      Notifications.setNotificationHandler(null);
      responseListener.remove();
      receiveListener.remove();
    };
  }, [isRestoring, userId, router, queryClient]);

  return null;
}
