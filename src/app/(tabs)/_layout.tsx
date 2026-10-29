import { Tabs, usePathname } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";

import { ItemSaveFlow } from "@/components/ItemSaveFlow";
import { LinkDetectModal } from "@/components/LinkDetectModal";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/contexts/AuthContext";
import { useItemSave } from "@/hooks/useItemSave";
import { useLoginGate } from "@/hooks/useLoginGate";
import { takeShareLink } from "@/lib/pendingShareLink";

export default function TabLayout() {
  const itemSave = useItemSave();
  const { requireLogin, loginModal } = useLoginGate();
  const { start } = itemSave;
  const pathname = usePathname();
  const { session } = useAuth();

  // SAVE-002 신규 회원은 가입 완료 안내를 거쳐 오므로 ALL 탭 진입 때 받는다.
  useEffect(() => {
    if (!session || pathname !== "/all") return;
    const resume = () =>
      void takeShareLink().then((url) => {
        if (url) start(url, "share");
      });
    // 소셜 로그인 창이 닫히는 동안 앱이 아직 inactive라, 이때 로딩 창을 띄우면 iOS가 무시하고 화면이 막힌다.
    if (AppState.currentState === "active") {
      resume();
      return;
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      subscription.remove();
      resume();
    });
    return () => subscription.remove();
  }, [session, pathname, start]);

  return (
    <>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <NavigationBar {...props} />}>
        <Tabs.Screen name="all" />
        <Tabs.Screen name="folder" />
        <Tabs.Screen name="diggle" />
        <Tabs.Screen name="my" />
      </Tabs>

      {/* 스플래시와 로그인을 지나 탭 화면에 들어왔을 때부터 클립보드를 본다. */}
      <LinkDetectModal
        isBusy={itemSave.isBusy}
        onLoad={(url) => requireLogin(() => void itemSave.start(url))}
      />

      <ItemSaveFlow itemSave={itemSave} />
      {loginModal}
    </>
  );
}
