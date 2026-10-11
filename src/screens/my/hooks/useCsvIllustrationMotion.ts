import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing } from "react-native";

// Figma CSVImportIllustration Step 1→5. 각 행: 중심 X/Y, 너비, 시계 방향 회전, 불투명도.
// 좌표는 폴더의 Step 1 위치(101, 558)를 기준으로 환산했습니다.
const PRODUCT_POSES = [
  [
    [131.41, 30.41, 85.585, 15, 1],
    [113.646, 48.41, 85.585, 23, 1],
    [81.78, 43.04, 27.216, 35, 0],
    [89.61, 53.48, 24.905, 35, 0],
    [131.41, 16.41, 85.585, 15, 0],
  ],
  [
    [50.566, -45.433, 64, -6.805, 1],
    [70.605, -5.045, 48, 5.195, 1],
    [77, 34.001, 11.52, 23.195, 0],
    [87, 33.999, 11.52, -6.805, 0],
    [50.566, -61.433, 64, -6.805, 0],
  ],
  [
    [20.209, -155.791, 84, -10.942, 1],
    [60.284, -45.516, 63, -20.942, 1],
    [95, 34, 15.12, -35.942, 0],
    [87, 33.999, 15.12, -10.942, 0],
    [20.209, -171.791, 84, -10.942, 0],
  ],
  [
    [166.273, -150.727, 57.6, 15, 1],
    [126.636, -61.364, 43.2, 1, 1],
    [83, 34.002, 10.368, -20, 0],
    [87, 33.999, 10.368, 15, 0],
    [166.273, -166.727, 57.6, 15, 0],
  ],
  [
    [122, -115, 66, 0, 1],
    [100.3, -26.34, 49.5, 10, 1],
    [93, 34, 11.88, 25, 0],
    [87, 34, 11.88, 0, 0],
    [122, -131, 66, 0, 0],
  ],
] as const;
const INPUT_RANGE = [0, 1, 2, 3, 4, 5];

export function useCsvIllustrationMotion(isEnabled: boolean) {
  const [step] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!isEnabled) return;
    let isActive = true;
    let isReducedMotion = true;
    let animation: Animated.CompositeAnimation | undefined;
    const update = () => {
      if (!isActive) return;
      animation?.stop();
      step.setValue(0);
      if (isReducedMotion || AppState.currentState !== "active") return;
      const move = (toValue: number, duration: number, isEaseIn: boolean) =>
        Animated.timing(step, {
          toValue,
          duration,
          easing: isEaseIn ? Easing.bezier(0.42, 0, 1, 1) : Easing.bezier(0, 0, 0.58, 1),
          useNativeDriver: true,
          isInteraction: false,
        });
      animation = Animated.loop(
        Animated.sequence([
          // delay만 첫 자식이면 loop가 아이템 Value를 초기화하지 않아 5→1로 역주행합니다.
          move(0, 0, false),
          Animated.delay(800),
          move(1, 550, true),
          Animated.delay(1),
          move(2, 300, true),
          Animated.delay(1),
          move(3, 350, false),
          Animated.delay(500),
          move(4, 0, false),
          Animated.delay(1),
          move(5, 600, false),
        ]),
      );
      animation.start();
    };
    const onReduceMotion = (value: boolean) => {
      isReducedMotion = value;
      update();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(onReduceMotion, () => onReduceMotion(true));
    const motionSubscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      onReduceMotion,
    );
    const appSubscription = AppState.addEventListener("change", update);
    return () => {
      isActive = false;
      animation?.stop();
      step.setValue(0);
      motionSubscription.remove();
      appSubscription.remove();
    };
  }, [isEnabled, step]);

  const interpolate = (outputRange: number[]) =>
    step.interpolate({ inputRange: INPUT_RANGE, outputRange });
  const productStyle = (index: number) => {
    const poses = PRODUCT_POSES[index];
    const base = poses[0];
    const loop = [...poses, base];
    return {
      // 반투명 폴더 앞면 뒤로 아이템 잔상이 비치지 않도록 흡수 중 먼저 사라집니다.
      opacity: step.interpolate({
        inputRange: [0, 1, 1.2, 2, 3, 4, 5],
        outputRange: [1, 1, 0, 0, 0, 0, 1],
      }),
      transform: [
        { translateX: interpolate(loop.map((pose) => pose[0] - base[0])) },
        { translateY: interpolate(loop.map((pose) => pose[1] - base[1])) },
        {
          rotate: step.interpolate({
            inputRange: INPUT_RANGE,
            outputRange: loop.map((pose) => `${pose[3]}deg`),
          }),
        },
        { scale: interpolate(loop.map((pose) => pose[2] / base[2])) },
      ],
    };
  };
  return {
    productStyle,
    folderStyle: {
      transform: [
        { translateY: interpolate([0, 0, -3.48, 1.74, 0, 0]) },
        { scale: interpolate([1, 1, 1.06, 0.97, 1, 1]) },
      ],
    },
    beamStyle: { opacity: interpolate([0.5, 0.7, 1, 0.4, 0.4, 0.5]) },
    glowStyle: {
      transform: [{ scale: interpolate([1, 171 / 161, 180 / 161, 151 / 161, 151 / 161, 1]) }],
    },
  };
}
