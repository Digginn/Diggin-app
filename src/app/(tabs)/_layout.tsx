import { Tabs } from "expo-router";

import { ItemSaveFlow } from "@/components/ItemSaveFlow";
import { LinkDetectModal } from "@/components/LinkDetectModal";
import { NavigationBar } from "@/components/NavigationBar";
import { useItemSave } from "@/hooks/useItemSave";

export default function TabLayout() {
  const itemSave = useItemSave();

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
