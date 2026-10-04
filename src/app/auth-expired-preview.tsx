import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { AllScreen } from "@/screens/all/AllScreen";
import { SessionExpiredModal } from "@/screens/login/components/SessionExpiredModal";

// 인증 연동 전 모달 UI와 두 버튼의 동작을 확인하는 화면입니다.
export default function AuthExpiredPreview() {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(true);

  return (
    <View className="flex-1 bg-gray-0">
      <AllScreen />
      <SessionExpiredModal
        visible={isVisible}
        onLater={() => setIsVisible(false)}
        onLogin={() => router.replace("/login")}
      />
    </View>
  );
}
