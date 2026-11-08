import { cssInterop } from "nativewind";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ErrorSvg from "@/assets/images/icon-share-error.svg";
import { Button } from "@/components/Button";

const ErrorIcon = cssInterop(ErrorSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

const BOTTOM_PADDING = 40;

/** 공유 시트가 링크를 못 받았을 때의 사유. */
export type ShareErrorReason = "no_url" | "deeplink" | "invalid_format" | "network";

// 시안 MSG-SAVE-001(4166:58314)은 링크 없음과 형식 오류를 같은 문구로, MSG-SAVE-014(4166:58372)는 앱 전용 링크를 두 문단으로 안내한다.
const MESSAGES: Record<ShareErrorReason, string[]> = {
  no_url: ["링크를 찾지 못했습니다.\n다시 확인해 주세요."],
  deeplink: [
    "이 앱의 링크는 불러올 수 없습니다.",
    "웹페이지 아이템 링크를 복사한 후\n다시 시도해 주세요.",
  ],
  invalid_format: ["링크를 찾지 못했습니다.\n다시 확인해 주세요."],
  // SYS-001 시안이 없어 같은 틀을 쓴다.
  network: ["연결 상태를 확인한 후\n다시 시도해 주세요."],
};

type ShareErrorSheetProps = {
  reason: ShareErrorReason;
  onClose: () => void;
};

/** iOS 공유 카드와 Android 공유 수신 화면에서 사용하는 오류 상태. */
export function ShareErrorSheet({ reason, onClose }: ShareErrorSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="w-full flex-1 items-center gap-3 rounded-t-2xl bg-gray-0 px-margin pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, BOTTOM_PADDING) }}
    >
      <View
        accessibilityElementsHidden
        className="h-1 w-8 rounded-full bg-gray-500"
        importantForAccessibility="no"
      />

      <View className="w-full items-center pt-4">
        <Text className="text-center text-gray-900 font-label-20">Diggin에 저장</Text>
      </View>

      <View className="w-full flex-1 items-center justify-center gap-6">
        <ErrorIcon className="size-[68px]" />
        <View accessibilityLiveRegion="polite" className="w-full gap-[10px]">
          {MESSAGES[reason].map((paragraph) => (
            <Text key={paragraph} className="text-center text-gray-900 font-label-18-semibold">
              {paragraph}
            </Text>
          ))}
        </View>
      </View>

      <View className="w-full pt-[13px]">
        <Button size="large" onPress={onClose}>
          닫기
        </Button>
      </View>
    </View>
  );
}
