import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

const DISMISSED_UNTIL_KEY = "push-off-banner-dismissed-until";

/**
 * NOTI-002 기기 알림이 꺼져 있는지와 안내를 닫아 둔 기한. 설정에서 켜고 돌아오면 다시 확인한다.
 * 아직 정하지 않은 권한은 로그인 직후 묻기 때문에 꺼진 것으로 보지 않는다.
 */
export function useDevicePushOff() {
  const [isDenied, setDenied] = useState<boolean | null>(null);
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null);

  useEffect(() => {
    const check = () =>
      void Notifications.getPermissionsAsync()
        .then(({ status }) => setDenied(status === "denied"))
        .catch(() => setDenied(false));
    check();
    AsyncStorage.getItem(DISMISSED_UNTIL_KEY)
      .then((value) => setDismissedUntil(Number(value) || 0))
      .catch(() => setDismissedUntil(0));
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, []);

  return {
    // 둘 다 읽기 전에는 안내를 띄우지 않아, 닫아 둔 안내가 잠깐 보였다 사라지지 않는다.
    isPushOff: isDenied === true && dismissedUntil !== null,
    dismissedUntil: dismissedUntil ?? 0,
    dismiss: (until: number) => {
      setDismissedUntil(until);
      AsyncStorage.setItem(DISMISSED_UNTIL_KEY, String(until)).catch(() => {});
    },
  };
}
