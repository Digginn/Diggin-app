import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PasteGuideModal } from "@/components/PasteGuideModal";
import { ItemLinkSheet } from "@/screens/save/components/ItemLinkSheet";
import { ItemSaveSheet, type ItemSaveValues } from "@/screens/save/components/ItemSaveSheet";
import { ShareErrorSheet, type ShareErrorReason } from "@/screens/save/components/ShareErrorSheet";

// 아이템 저장 시트 확인용 화면입니다. 실제 저장 흐름이 붙기 전까지만 씁니다.
const PREVIEW_VALUES: ItemSaveValues = {
  name: "Real Good Pants 엄청 좋은 바지",
  brand: "리얼굿",
  price: "70,000원",
  sourceUrl: "http://pf.kakao.com/_zIxnrX",
  thumbnailUrl: null,
  wishLevel: null,
};

type PreviewKind = "link" | "loaded" | "failed" | "paste" | ShareErrorReason | null;

const EMPTY_VALUES: ItemSaveValues = {
  name: "",
  brand: "",
  price: "",
  sourceUrl: "http://pf.kakao.com/_zIxnrX",
  thumbnailUrl: null,
  wishLevel: null,
};

export default function SavePreviewRoute() {
  const [open, setOpen] = useState<PreviewKind>(null);

  return (
    <SafeAreaView className="flex-1 bg-gray-0" edges={["top"]}>
      <View className="gap-3 px-margin pt-6">
        <Text className="text-gray-1000 font-label-16-semibold">아이템 저장</Text>
        {(
          [
            ["link", "아이템 추가 (링크 입력)"],
            ["loaded", "아이템 정보 확인 (SAVE-06)"],
            ["failed", "정보를 불러오지 못함 (SAVE-08)"],
            ["paste", "붙여넣기 설정 안내 (SAVE-17)"],
            ["no_url", "공유 오류 · URL 없음 (MSG-SAVE-014)"],
            ["deeplink", "공유 오류 · 앱 전용 딥링크"],
            ["invalid_format", "공유 오류 · 형식 오류"],
          ] as const
        ).map(([kind, label]) => (
          <Pressable
            key={kind}
            accessibilityRole="button"
            className="h-12 justify-center rounded-field bg-gray-100 px-4 active:opacity-75"
            onPress={() => setOpen(kind)}
          >
            <Text className="text-gray-900 font-label-16-medium">{label}</Text>
          </Pressable>
        ))}
      </View>

      <ItemLinkSheet
        key={`link-${open}`}
        visible={open === "link"}
        onRequestClose={() => setOpen(null)}
        onSubmit={() => setOpen("loaded")}
      />

      <ItemSaveSheet
        key={`save-${open}`}
        visible={open === "loaded" || open === "failed"}
        hasExtractionFailed={open === "failed"}
        initialValues={open === "failed" ? EMPTY_VALUES : PREVIEW_VALUES}
        onRequestClose={() => setOpen(null)}
        onSubmit={() => setOpen(null)}
      />

      {open === "no_url" || open === "deeplink" || open === "invalid_format" ? (
        // 실제로는 공유 확장이 띄운다. 여기서는 생김새만 확인한다.
        <View className="absolute inset-x-0 bottom-0">
          <ShareErrorSheet reason={open} onClose={() => setOpen(null)} />
        </View>
      ) : null}

      <PasteGuideModal
        visible={open === "paste"}
        onRequestClose={() => setOpen(null)}
        onOpenSettings={() => setOpen(null)}
      />
    </SafeAreaView>
  );
}
