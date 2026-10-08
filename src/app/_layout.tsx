import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { BlockedUsersProvider } from "@/contexts/BlockedUsersContext";
import { PostDraftProvider } from "@/contexts/PostDraftContext";
import { PostsProvider } from "@/contexts/PostsContext";
import { ToastProvider } from "@/contexts/ToastContext";

import "@/global.css";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    "Pretendard-Regular": require("@/assets/fonts/Pretendard-Regular.otf"),
    "Pretendard-Medium": require("@/assets/fonts/Pretendard-Medium.otf"),
    "Pretendard-SemiBold": require("@/assets/fonts/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("@/assets/fonts/Pretendard-Bold.otf"),
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <ToastProvider>
      <BlockedUsersProvider>
        <PostDraftProvider>
          <PostsProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </PostsProvider>
        </PostDraftProvider>
      </BlockedUsersProvider>
    </ToastProvider>
  );
}
