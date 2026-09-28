import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type CardSkeletonProps = {
  className?: string;
};

const DURATION = 800;
const MIN_OPACITY = 0.4;

export function CardSkeleton({ className }: CardSkeletonProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(MIN_OPACITY, { duration: DURATION }), -1, true);
  }, [opacity]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View className={className}>
      <Animated.View style={[{ gap: 8 }, fadeStyle]}>
        <View className="h-[106px] w-full rounded-lg bg-gray-100" />
        <View className="w-full gap-1.5 overflow-hidden">
          <View className="h-3 w-[72px] rounded bg-gray-100" />
          <View className="h-2.5 w-24 rounded bg-gray-100" />
          <View className="h-2.5 w-14 rounded bg-gray-100" />
        </View>
      </Animated.View>
    </View>
  );
}
