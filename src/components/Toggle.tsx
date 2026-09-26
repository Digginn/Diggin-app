import { Pressable } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/theme";

const TRACK_WIDTH = 64;
const TRACK_HEIGHT = 28;
const TRACK_PADDING = 2;
const KNOB_WIDTH = 39;
const KNOB_HEIGHT = 24;
const KNOB_TRAVEL = TRACK_WIDTH - KNOB_WIDTH - TRACK_PADDING * 2;
const DURATION = 200;
const TRACK_OFF = colors.gray[500];
const TRACK_ON = colors.gray[900];

// 토글 
const trackBase = {
  width: TRACK_WIDTH,
  height: TRACK_HEIGHT,
  borderRadius: TRACK_HEIGHT / 2,
  padding: TRACK_PADDING,
  justifyContent: "center",
} as const;

// 토글 버튼
const knobBase = {
  width: KNOB_WIDTH,
  height: KNOB_HEIGHT,
  borderRadius: KNOB_HEIGHT / 2,
  backgroundColor: colors.gray[0],
} as const;

type ToggleProps = {
  isOn: boolean;
  onChange: (isOn: boolean) => void;
};

export function Toggle({ isOn, onChange }: ToggleProps) {
  const progress = useDerivedValue(() => withTiming(isOn ? 1 : 0, { duration: DURATION }));

  // on/off 두 색 사이의 중간색을 계산한다 - progress가 0이면 gray_500, 1이면 gray_900, 0.5면 그 중간색
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [TRACK_OFF, TRACK_ON]),
  }));

  // on/off 상태에 따른 knob 이동 - progress가 1일 때 KNOB_TRAVEL만큼 오른쪽으로
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * KNOB_TRAVEL }],
  }));

  return (
    <Pressable
      onPress={() => onChange(!isOn)}
      accessibilityRole="switch"
      accessibilityState={{ checked: isOn }}
      // 세로 높이를 위아래 10씩 넓혀 접근성 최소 기준 48을 맞춤 (48 * 48)
      hitSlop={{ top: 10, bottom: 10 }}
      className="w-16"
    >
      <Animated.View style={[trackBase, trackStyle]}>
        <Animated.View style={[knobBase, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}
