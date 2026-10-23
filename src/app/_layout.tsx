import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, type ReactNode } from "react";
import { AppState } from "react-native";

import { folderKeys } from "@/api/folders";
import { productKeys } from "@/api/products";
import { AccountAccessNotice } from "@/components/AccountAccessNotice";
import { AndroidPushNotifications } from "@/components/AndroidPushNotifications";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BlockedUsersProvider } from "@/contexts/BlockedUsersContext";
import { BrowsingModeProvider } from "@/contexts/BrowsingModeContext";
import { PostDraftProvider } from "@/contexts/PostDraftContext";
import { PostsProvider } from "@/contexts/PostsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { registerDevicePush } from "@/lib/pushNotifications";
import { queryClient } from "@/lib/queryClient";
import { readSharedSaveTime } from "@/lib/sharedSaves";
import { SessionExpiredModal } from "@/screens/login/components/SessionExpiredModal";

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

// AUTH-010·SYS-004 어느 화면에서든 안내하고, 확인하면 로그아웃과 같이 앱 시작 Flow로 보낸다.
function SessionExpiredNotice() {
  const router = useRouter();
  const { isSessionExpired, confirmSessionExpired } = useAuth();

  return (
    <SessionExpiredModal
      visible={isSessionExpired}
      onConfirm={() => {
        confirmSessionExpired();
        router.replace("/");
      }}
    />
  );
}

// NOTI-001 로그인한 계정이 바뀌면 Push 토큰을 등록한다. 설정에서 알림을 켜고 돌아온 경우도 앱 복귀 때 등록한다.
function PushRegistration() {
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    const register = (shouldAsk: boolean) =>
      void registerDevicePush(userId, shouldAsk).catch((error: unknown) =>
        console.warn("Push 토큰을 등록하지 못했습니다.", error),
      );
    register(true);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") register(false);
    });
    return () => subscription.remove();
  }, [userId]);

  return null;
}

// 공유 확장(#91)에서 저장하면 앱으로 돌아올 때 상품·폴더 목록을 다시 불러온다. 저장이 없었으면 그대로 둔다.
function SharedSaveSync() {
  const lastSeen = useRef<number | null>(null);

  useEffect(() => {
    const sync = () =>
      void readSharedSaveTime().then((savedAt) => {
        const previous = lastSeen.current;
        lastSeen.current = savedAt;
        if (previous === null || savedAt <= previous) return;
        void queryClient.invalidateQueries({ queryKey: productKeys.all });
        void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      });
    sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => subscription.remove();
  }, []);

  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    "Pretendard-Regular": require("@/assets/fonts/Pretendard-Regular.otf"),
    "Pretendard-Medium": require("@/assets/fonts/Pretendard-Medium.otf"),
    "Pretendard-SemiBold": require("@/assets/fonts/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("@/assets/fonts/Pretendard-Bold.otf"),
  });

  return (
    <QueryClientProvider client={queryClient}>
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
                      <Stack.Screen
                        name="posts/save"
                        options={{ animation: "slide_from_bottom" }}
                      />
                    </Stack>
                    <SessionExpiredNotice />
                    <PushRegistration />
                    <AndroidPushNotifications />
                    <SharedSaveSync />
                    <AccountAccessNotice />
                  </PostsProvider>
                </PostDraftProvider>
              </BlockedUsersProvider>
            </ToastProvider>
          </BrowsingModeProvider>
        </SplashGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}
