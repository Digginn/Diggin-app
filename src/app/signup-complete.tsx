import { useEffect } from "react";
import { Platform } from "react-native";

import { OnboardingFinishScreen } from "@/screens/onboarding/OnboardingFinishScreen";

export default function SignupCompleteScreen() {
  useEffect(() => {
    if (Platform.OS !== "ios") return;

    void import("expo-notifications")
      .then(async (Notifications) => {
        const { ios } = await Notifications.getPermissionsAsync();
        if (ios?.status === Notifications.IosAuthorizationStatus.NOT_DETERMINED) {
          await Notifications.requestPermissionsAsync();
        }
      })
      .catch((error: unknown) => console.warn("알림 권한 요청에 실패했습니다.", error));
  }, []);

  return <OnboardingFinishScreen mode="signed-up" />;
}
