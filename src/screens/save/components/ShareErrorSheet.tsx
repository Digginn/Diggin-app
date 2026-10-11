import { cssInterop } from "nativewind";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import InfoSvg from "@/assets/images/icon-share-sheet-info.svg";
import { Button } from "@/components/Button";

const InfoIcon = cssInterop(InfoSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

const BOTTOM_PADDING = 32;

/** 공유 시트가 링크를 못 받았을 때의 사유. */
export type ShareErrorReason = "no_url" | "deeplink" | "invalid_format";

const MESSAGES: Record<ShareErrorReason, string> = {
  no_url: "공유한 내용에서 아이템 링크를 찾지 못했습니다.",
  deeplink: "이 앱의 링크는 불러올 수 없습니다.\n아이템 페이지 링크를 다시 복사한 후 시도해 주세요.",
  invalid_format: "올바른 링크인지 확인 후 다시 시도해 주세요.",
};

type ShareErrorSheetProps = {
  reason: ShareErrorReason;
  onClose: () => void;
};

/**
 * 타 앱 위에 뜨는 공유 확장 시트의 오류 상태.
 *
 * 확장은 우리 앱이 아니라 공유 시트 안에서 도는 별도 루트라, 바텀시트처럼 모달로 띄우지 않고
 * 화면 하단에 그대로 붙인다. 스크림과 띄우는 일은 확장 껍데기가 맡는다.
 */
export function ShareErrorSheet({ reason, onClose }: ShareErrorSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="w-full gap-3 rounded-t-2xl bg-gray-0 px-margin pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, BOTTOM_PADDING) }}
    >
      <View
        accessibilityElementsHidden
        className="h-1 w-8 self-center rounded-full bg-gray-500"
        importantForAccessibility="no"
      />

      <View className="h-6 w-full items-center justify-center overflow-hidden">
        <Text className="text-center text-gray-900 font-label-16-semibold">Diggin에 저장</Text>
      </View>

      <View className="w-full flex-row items-center gap-2 overflow-hidden rounded bg-gray-100 p-4">
        <InfoIcon className="size-6" />
        <Text className="flex-1 text-gray-900 font-b3">{MESSAGES[reason]}</Text>
      </View>

      <View className="w-full pt-[13px]">
        <Button size="large" onPress={onClose}>
          닫기
        </Button>
      </View>
    </View>
  );
}
