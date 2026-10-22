import { useIsFocused, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";

import { AppBar } from "@/components/app-bar";
import { LoginRequiredModal } from "@/components/modal";
import { useAuth } from "@/contexts/AuthContext";
import { startLogin } from "@/lib/loginIntent";

type MemberOnlyProps = { title?: string; children: ReactNode };

/** AUTH-001 회원 전용 화면. 비회원은 화면 위 로그인 모달을 보고, 로그인하면 이 화면으로 돌아온다. */
export function MemberOnly({ title, children }: MemberOnlyProps) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { session, isRestoring } = useAuth();

  if (session) return children;
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/all"));
  return (
    <View className="flex-1 bg-gray-0">
      <AppBar title={title} onBack={leave} />
      {!isRestoring && (
        <LoginRequiredModal
          visible={isFocused}
          onClose={leave}
          onLogin={() => startLogin(router)}
        />
      )}
    </View>
  );
}
