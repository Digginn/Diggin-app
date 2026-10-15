import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ReactNode } from "react";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BlockedUsersProvider } from "@/contexts/BlockedUsersContext";
import { BrowsingModeProvider } from "@/contexts/BrowsingModeContext";
import { PostDraftProvider } from "@/contexts/PostDraftContext";
import { PostsProvider } from "@/contexts/PostsContext";
import { ToastProvider } from "@/contexts/ToastContext";

import "@/global.css";

SplashScreen.preventAutoHideAsync();

// 저장된 세션을 다 읽은 뒤에 스플래시를 내려야 첫 화면이 로그인 상태에 맞게 정해진다(AUTH-009).
function SplashGate({ isFontReady, children }: { isFontReady: boolean; children: ReactNode }) {
  const { isRestoring } = useAuth();
  const isReady = isFontReady && !isRestoring;

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync();
  }, [isReady]);

  return isReady ? children : null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    "Pretendard-Regular": require("@/assets/fonts/Pretendard-Regular.otf"),
    "Pretendard-Medium": require("@/assets/fonts/Pretendard-Medium.otf"),
    "Pretendard-SemiBold": require("@/assets/fonts/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("@/assets/fonts/Pretendard-Bold.otf"),
  });

  return (
    <AuthProvider>
      <SplashGate isFontReady={loaded || error !== null}>
        <BrowsingModeProvider>
          <ToastProvider>
            <BlockedUsersProvider>
              <PostDraftProvider>
                <PostsProvider>
                  <StatusBar style="auto" />
                  <Stack screenOptions={{ headerShown: false }}>
                    {/* 게시글 상세에서 아래에서 위로 올라오며 들어온다. */}
                    <Stack.Screen name="posts/save" options={{ animation: "slide_from_bottom" }} />
                  </Stack>
                </PostsProvider>
              </PostDraftProvider>
            </BlockedUsersProvider>
          </ToastProvider>
        </BrowsingModeProvider>
      </SplashGate>
    </AuthProvider>
  );
}
