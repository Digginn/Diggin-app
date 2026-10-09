import { Tabs } from "expo-router";

import { LinkDetectModal } from "@/components/LinkDetectModal";
import { LoadingDialog } from "@/components/Loading";
import { NavigationBar } from "@/components/NavigationBar";
import { TOAST_MESSAGES } from "@/constants/messages";
import { EMPTY_ITEM_SAVE_VALUES, useItemSave } from "@/hooks/useItemSave";
import { useToast } from "@/hooks/useToast";
import { ItemSaveSheet } from "@/screens/save/components/ItemSaveSheet";

export default function TabLayout() {
  const showToast = useToast();
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

      <LoadingDialog
        visible={itemSave.isLoading}
        message="아이템 정보를 불러오는 중입니다."
        onDismiss={itemSave.openAfterLoading}
      />

      <ItemSaveSheet
        key={`save-${itemSave.values?.sourceUrl ?? ""}`}
        visible={itemSave.values !== null}
        hasExtractionFailed={itemSave.hasFailed}
        initialValues={itemSave.values ?? EMPTY_ITEM_SAVE_VALUES}
        onRequestClose={itemSave.close}
        onSubmit={() => {
          itemSave.close();
          showToast(TOAST_MESSAGES.SAVE_011);
        }}
      />
    </>
  );
}
