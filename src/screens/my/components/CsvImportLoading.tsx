import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Text, View } from "react-native";

import type { CsvImportProgress } from "../types/csvImport";

export function CsvImportLoading({ progress }: { progress?: CsvImportProgress }) {
  const [width] = useState(() => new Animated.Value(1));
  useEffect(() => {
    // 실제 개수가 있으면 진행률을 그대로 사용합니다. 총 개수가 아직 없을 때만 Figma 루프를 사용합니다.
    if (progress) return;
    let isActive = true;
    let animation: Animated.CompositeAnimation | undefined;
    const start = (isReducedMotion: boolean) => {
      if (!isActive) return;
      animation?.stop();
      width.setValue(1);
      if (isReducedMotion) return;
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(width, {
            toValue: 187.606,
            duration: 2500,
            easing: Easing.bezier(0, 0, 0.58, 1),
            useNativeDriver: false,
          }),
          Animated.delay(1000),
        ]),
      );
      animation.start();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(start, () => start(true));
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", start);
    return () => {
      isActive = false;
      animation?.stop();
      subscription.remove();
    };
  }, [progress, width]);
  const ratio =
    progress && progress.total > 0
      ? Math.min(1, Math.max(0, progress.completed / progress.total))
      : 0;
  return (
    <View className="absolute inset-0 items-center justify-center px-margin" pointerEvents="none">
      <View className="items-center gap-3" accessibilityLiveRegion="polite">
        <View className="h-2" />
        <Text className="text-center text-gray-0 font-label-18-semibold">
          CSV 파일을 불러오는 중입니다.
        </Text>
        <Text className="text-center text-gray-400 font-b3">
          앱을 종료하면 불러오기가 중단됩니다.
        </Text>
        <View className="h-3" />
        <View
          accessibilityRole="progressbar"
          accessibilityValue={
            progress && progress.total > 0
              ? { min: 0, max: progress.total, now: progress.completed }
              : undefined
          }
          className="h-1 w-[200px] overflow-hidden rounded-sm bg-gray-800"
        >
          <Animated.View
            className="h-full rounded-sm bg-gray-0"
            style={{ width: progress ? ratio * 200 : width }}
          />
        </View>
        <Text className="text-gray-400 font-meta">
          {progress ? `${progress.completed} / ${progress.total}` : "불러오는 중"}
        </Text>
      </View>
    </View>
  );
}
