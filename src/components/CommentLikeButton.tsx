import { useEffect, useRef } from "react";
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

import Burst0Svg from "@/assets/images/icon-comment-like-burst-0.svg";
import Burst1Svg from "@/assets/images/icon-comment-like-burst-1.svg";
import Burst2Svg from "@/assets/images/icon-comment-like-burst-2.svg";
import Burst3Svg from "@/assets/images/icon-comment-like-burst-3.svg";
import Burst4Svg from "@/assets/images/icon-comment-like-burst-4.svg";
import Burst5Svg from "@/assets/images/icon-comment-like-burst-5.svg";
import HeartFilledSvg from "@/assets/images/icon-comment-like-filled.svg";
import FloatingHeartSvg from "@/assets/images/icon-comment-like-floating.svg";
import HeartSvg from "@/assets/images/icon-comment-like.svg";

// Figma TouchArea/16LikeHeart: False(0) → Rise(1) → Pop(2) → Fall(3) → True(4).
const PHASES = [0, 1, 2, 3, 4];
const BURSTS = [
  { Icon: Burst0Svg, size: 10, pop: [8.7977, -48.8323], fall: [10.3545, -63.3365] },
  { Icon: Burst1Svg, size: 4, pop: [30.7143, -35.2488], fall: [44.7482, -44.0937] },
  { Icon: Burst2Svg, size: 7, pop: [40.8611, -17.8968], fall: [65.9242, -9.8173] },
  { Icon: Burst3Svg, size: 3, pop: [14.5826, 0.4163], fall: [14.5088, 19.8428] },
  { Icon: Burst4Svg, size: 9, pop: [-9.9578, -15.0225], fall: [-24.6555, -2.7731] },
  { Icon: Burst5Svg, size: 5, pop: [0.377, -36.1168], fall: [-9.5014, -44.7628] },
] as const;

type CommentLikeButtonProps = {
  isLiked: boolean;
  likeCount: number;
  onPress?: () => void;
};

export function CommentLikeButton({ isLiked, likeCount, onPress }: CommentLikeButtonProps) {
  const previousLiked = useRef(isLiked);
  const phase = useSharedValue(isLiked ? 4 : 0);
  const fill = useSharedValue(isLiked ? 1 : 0);

  useEffect(() => {
    if (previousLiked.current === isLiked) return;
    previousLiked.current = isLiked;
    cancelAnimation(phase);
    const easeOut = Easing.bezier(0, 0, 0.58, 1);
    fill.set(withTiming(isLiked ? 1 : 0, { duration: isLiked ? 60 : 120, easing: easeOut }));
    if (isLiked) {
      phase.set(0);
      phase.set(
        withSequence(
          withTiming(1, { duration: 60, easing: easeOut }),
          withDelay(20, withTiming(2, { duration: 100, easing: easeOut })),
          withDelay(60, withTiming(3, { duration: 300, easing: easeOut })),
          withDelay(300, withTiming(4, { duration: 80, easing: Easing.bezier(0.42, 0, 1, 1) })),
        ),
      );
    } else {
      // 연속 탭·화면 이탈 시에도 떠오른 하트나 입자를 남기지 않는다.
      phase.set(0);
    }
  }, [isLiked, phase, fill]);

  useEffect(
    () => () => {
      cancelAnimation(phase);
      cancelAnimation(fill);
    },
    [phase, fill],
  );

  const heartStyle = useAnimatedStyle(
    () => ({ transform: [{ scale: interpolate(phase.value, PHASES, [1, 1.35, 1.35, 1.35, 1]) }] }),
    [phase],
  );
  const emptyStyle = useAnimatedStyle(() => ({ opacity: 1 - fill.value }), [fill]);
  const filledStyle = useAnimatedStyle(() => ({ opacity: fill.value }), [fill]);
  const floatingStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(phase.value, PHASES, [0, 1, 1, 1, 0]),
      transform: [
        { translateY: interpolate(phase.value, PHASES, [0, -44, -44, -44, 0]) },
        { scale: interpolate(phase.value, PHASES, [16 / 28.8, 1, 1, 1, 16 / 28.8]) },
      ],
    }),
    [phase],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="댓글 좋아요"
      accessibilityValue={{ text: `${likeCount}개` }}
      accessibilityState={{ selected: isLiked, disabled: !onPress }}
      aria-selected={isLiked}
      aria-valuetext={`${likeCount}개`}
      disabled={!onPress}
      className="h-12 flex-row items-center gap-0.5 px-2.5 active:opacity-75"
      onPress={onPress}
    >
      <View pointerEvents="none" className="absolute left-0 top-0 h-12 w-12">
        {BURSTS.map((burst, index) => (
          <CommentLikeBurst key={index} burst={burst} phase={phase} />
        ))}
      </View>
      <View className="size-4">
        <Animated.View style={heartStyle}>
          <Animated.View style={emptyStyle}>
            <HeartSvg />
          </Animated.View>
          <View className="absolute inset-0">
            <Animated.View style={filledStyle}>
              <HeartFilledSvg />
            </Animated.View>
          </View>
        </Animated.View>
      </View>
      {/* Figma ShowCount=False: 0개면 숫자 없이 하트만 가운데 둔다(BUG-154). */}
      {likeCount > 0 && (
        <Text className="!leading-[14px] !tracking-normal text-gray-500 font-label-12-semibold">
          {likeCount}
        </Text>
      )}
      <View pointerEvents="none" className="absolute left-[3.6px] top-[9.6px]">
        <Animated.View style={floatingStyle}>
          <FloatingHeartSvg />
        </Animated.View>
      </View>
    </Pressable>
  );
}

function CommentLikeBurst({
  burst: { Icon, size, pop, fall },
  phase,
}: {
  burst: (typeof BURSTS)[number];
  phase: SharedValue<number>;
}) {
  const style = useAnimatedStyle(
    () => ({
      opacity: interpolate(phase.value, PHASES, [0, 0, 1, 1, 0]),
      transform: [
        {
          translateX:
            interpolate(phase.value, PHASES, [18, 18, pop[0] + size / 2, fall[0] + 0.005, 18]) -
            size / 2,
        },
        {
          translateY:
            interpolate(phase.value, PHASES, [24, -20, pop[1] + size / 2, fall[1] + 0.005, 24]) -
            size / 2,
        },
        { scale: interpolate(phase.value, PHASES, [0.01, 2, size, 0.01, 0.01]) / size },
      ],
    }),
    [phase, size, pop, fall],
  );
  return (
    <View className="absolute left-0 top-0">
      <Animated.View style={style}>
        <Icon />
      </Animated.View>
    </View>
  );
}
