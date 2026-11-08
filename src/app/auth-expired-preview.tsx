import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { AllScreen } from "@/screens/all/AllScreen";
import { SessionExpiredModal } from "@/screens/login/components/SessionExpiredModal";

// 실제 만료를 기다리지 않고 인증 만료 안내 모달을 확인하는 화면입니다.
export default function AuthExpiredPreview() {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(true);

  return (
    <View className="flex-1 bg-gray-0">
      <AllScreen />
      <SessionExpiredModal
        visible={isVisible}
        onConfirm={() => {
          setIsVisible(false);
          router.replace("/");
        }}
      />
    </View>
  );
}
