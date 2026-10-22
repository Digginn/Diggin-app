import { Tabs, usePathname } from "expo-router";
import { useEffect } from "react";

import { ItemSaveFlow } from "@/components/ItemSaveFlow";
import { LinkDetectModal } from "@/components/LinkDetectModal";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/contexts/AuthContext";
import { useItemSave } from "@/hooks/useItemSave";
import { takeShareLink } from "@/lib/pendingShareLink";

export default function TabLayout() {
  const itemSave = useItemSave();
  const { start } = itemSave;
  const pathname = usePathname();
  const { session } = useAuth();

  // SAVE-002 신규 회원은 가입 완료 안내를 거쳐 오므로 마운트가 아니라 ALL 탭 진입 때 받는다.
  // 둘러보기로 들어온 비회원도 ALL 탭에 오니 로그인한 뒤에만 꺼낸다.
  useEffect(() => {
    if (!session || pathname !== "/all") return;
    void takeShareLink().then((url) => {
      if (url) start(url);
    });
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
      <LinkDetectModal isBusy={itemSave.isBusy} onLoad={(url) => void itemSave.start(url)} />

      <ItemSaveFlow itemSave={itemSave} />
    </>
  );
}
