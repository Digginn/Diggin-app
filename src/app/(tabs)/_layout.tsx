import { Tabs } from "expo-router";
import { useState } from "react";

import { LinkDetectModal } from "@/components/LinkDetectModal";
import { NavigationBar } from "@/components/NavigationBar";
import { TOAST_MESSAGES } from "@/constants/messages";
import { useToast } from "@/hooks/useToast";
import { ItemSaveSheet, type ItemSaveValues } from "@/screens/save/components/ItemSaveSheet";

const EMPTY_SAVE_VALUES: ItemSaveValues = {
  name: "",
  brand: "",
  price: "",
  sourceUrl: "",
  thumbnailUrl: null,
  wishLevel: null,
};

export default function TabLayout() {
  const showToast = useToast();
  const [saveValues, setSaveValues] = useState<ItemSaveValues | null>(null);

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
        onLoad={(url) => {
          // TODO: 크롤링이 붙으면 불러온 이름 · 브랜드 · 가격 · 이미지를 채워 넘긴다.
          setSaveValues({ ...EMPTY_SAVE_VALUES, sourceUrl: url });
        }}
      />

      <ItemSaveSheet
        key={saveValues?.sourceUrl ?? "closed"}
        visible={saveValues !== null}
        // 크롤링 전까지는 값이 비어 있어 직접 입력하는 흐름으로 연다.
        hasExtractionFailed
        initialValues={saveValues ?? EMPTY_SAVE_VALUES}
        onRequestClose={() => setSaveValues(null)}
        onSubmit={() => {
          setSaveValues(null);
          showToast(TOAST_MESSAGES.SAVE_011);
        }}
      />
    </>
  );
}
