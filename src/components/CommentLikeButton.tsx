import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import HeartFilledSvg from "@/assets/images/icon-comment-like-filled.svg";
import Spark0Svg from "@/assets/images/icon-comment-like-spark-0.svg";
import Spark1Svg from "@/assets/images/icon-comment-like-spark-1.svg";
import Spark2Svg from "@/assets/images/icon-comment-like-spark-2.svg";
import Spark3Svg from "@/assets/images/icon-comment-like-spark-3.svg";
import Spark4Svg from "@/assets/images/icon-comment-like-spark-4.svg";
import Spark5Svg from "@/assets/images/icon-comment-like-spark-5.svg";
import HeartSvg from "@/assets/images/icon-comment-like.svg";

// Figma: 120ms 확대 → 120ms 유지 → 180ms 복귀.
const SPARKS = [
  { Icon: Spark0Svg, x: 16, y: 7.5, size: 4 },
  { Icon: Spark1Svg, x: 26.46, y: 16.75, size: 3 },
  { Icon: Spark2Svg, x: 28.56, y: 29.25, size: 4 },
  { Icon: Spark3Svg, x: 16.5, y: 34, size: 3 },
  { Icon: Spark4Svg, x: 3.44, y: 29.25, size: 4 },
  { Icon: Spark5Svg, x: 6.54, y: 16.75, size: 3 },
] as const;

type CommentLikeButtonProps = {
  isLiked: boolean;
  likeCount: number;
  onPress?: () => void;
};

export function CommentLikeButton({ isLiked, likeCount, onPress }: CommentLikeButtonProps) {
  const burst = useSharedValue(0);
  useEffect(() => () => cancelAnimation(burst), [burst]);
  const heartStyle = useAnimatedStyle(
    () => ({ transform: [{ scale: interpolate(burst.value, [0, 1, 2], [1, 1.35, 1]) }] }),
    [burst],
  );
  const Heart = isLiked ? HeartFilledSvg : HeartSvg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="댓글 좋아요"
      accessibilityValue={{ text: `${likeCount}개` }}
      accessibilityState={{ selected: isLiked, disabled: !onPress }}
      aria-selected={isLiked}
      aria-valuetext={`${likeCount}개`}
      disabled={!onPress}
      className="h-12 min-w-12 flex-row items-center gap-0.5 px-2.5 active:opacity-75"
      onPress={() => {
        cancelAnimation(burst);
        burst.set(0);
        if (!isLiked) {
          const easing = Easing.out(Easing.ease);
          burst.set(
            withSequence(
              withTiming(1, { duration: 120, easing }),
              withDelay(120, withTiming(2, { duration: 180, easing })),
            ),
          );
        }
        onPress?.();
      }}
    >
      <Animated.View style={heartStyle}>
        <Heart />
      </Animated.View>
      <Text className="!leading-[14px] !tracking-normal text-gray-500 font-label-12-semibold">
        {likeCount}
      </Text>
      <View pointerEvents="none" className="absolute left-0 top-0 h-12 w-12">
        {SPARKS.map((spark, index) => (
          <CommentLikeSpark key={index} spark={spark} burst={burst} />
        ))}
      </View>
    </Pressable>
  );
}

function CommentLikeSpark({
  spark: { Icon, x, y, size },
  burst,
}: {
  spark: (typeof SPARKS)[number];
  burst: SharedValue<number>;
}) {
  const style = useAnimatedStyle(
    () => ({
      opacity: interpolate(burst.value, [0, 1, 2], [0, 1, 0]),
      transform: [
        { translateX: interpolate(burst.value, [0, 1, 2], [17.5 - x, 0, 0]) },
        { translateY: interpolate(burst.value, [0, 1, 2], [17.5 - y, 0, -6]) },
        { scale: interpolate(burst.value, [0, 1, 2], [1 / size, 1, 1]) },
      ],
    }),
    [burst, x, y, size],
  );
  return (
    <Animated.View className="absolute" style={[{ left: x, top: y }, style]}>
      <Icon />
    </Animated.View>
  );
}
