import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Text, View } from "react-native";

import type { CsvImportProgress } from "../types/csvImport";

export function CsvImportLoading({ progress }: { progress?: CsvImportProgress }) {
  const hasMeasuredProgress = !!progress && progress.total > 0;
  const ratio = hasMeasuredProgress
    ? Math.min(1, Math.max(0, progress.completed / progress.total))
    : 0;
  const [width] = useState(() => new Animated.Value(hasMeasuredProgress ? ratio * 200 : 1));
  const progressLabel = hasMeasuredProgress
    ? `${progress.completed} / ${progress.total}`
    : "불러오는 중";
  useEffect(() => {
    let isActive = true;
    let animation: Animated.CompositeAnimation | undefined;
    const start = (isReducedMotion: boolean) => {
      if (!isActive) return;
      animation?.stop();
      if (hasMeasuredProgress) {
        // 실제 수신값까지만 보간한다. 재시도 초기화·완료는 즉시 반영해 흐름을 지연시키지 않는다.
        if (isReducedMotion || ratio === 0 || ratio === 1) {
          width.setValue(ratio * 200);
          return;
        }
        animation = Animated.timing(width, {
          toValue: ratio * 200,
          duration: 180,
          easing: Easing.bezier(0, 0, 0.58, 1),
          useNativeDriver: false,
        });
        animation.start();
        return;
      }
      // 파일 준비 중 전체 건수를 알기 전에는 Figma의 반복 로딩을 사용한다.
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
  }, [hasMeasuredProgress, ratio, width]);
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
          accessibilityState={{ busy: ratio < 1 }}
          accessibilityValue={
            hasMeasuredProgress
              ? { min: 0, max: progress.total, now: progress.completed }
              : { text: progressLabel }
          }
          className="h-1 w-[200px] overflow-hidden rounded-sm bg-gray-800"
        >
          <Animated.View className="h-full rounded-sm bg-gray-0" style={{ width }} />
        </View>
        <Text className="text-gray-400 font-meta">{progressLabel}</Text>
      </View>
    </View>
  );
}
