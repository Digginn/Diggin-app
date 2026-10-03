import { useEffect } from "react";
import { AccessibilityInfo, Modal, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import SpinnerIcon from "@/assets/images/icon-loading-spinner.svg";
import TrackIcon from "@/assets/images/icon-loading-track.svg";

type LoadingDialogProps = {
  message: string;
  onRequestClose?: () => void;
};

function LoadingSpinner() {
  const rotation = useSharedValue(0);

  useEffect(() => {
    let isMounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((isReducedMotion) => {
      if (!isMounted || isReducedMotion) return;

      rotation.value = withRepeat(
        withTiming(360, { duration: 800, easing: Easing.linear }),
        -1,
        false,
      );
    });

    return () => {
      isMounted = false;
      cancelAnimation(rotation);
    };
  }, [rotation]);

  const rotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View className="size-8 items-center justify-center" accessible={false}>
      <View className="absolute inset-0 items-center justify-center">
        <TrackIcon />
      </View>
      <Animated.View style={rotateStyle}>
        <SpinnerIcon />
      </Animated.View>
    </View>
  );
}

export function LoadingDialog({ message, onRequestClose }: LoadingDialogProps) {
  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onRequestClose ?? (() => {})}
    >
      <View className="flex-1 items-center justify-center bg-black/[0.36]">
        <View className="w-[240px] items-center gap-4 rounded-[8px] bg-gray-0 px-6 py-7">
          <LoadingSpinner />
          <Text className="text-center text-gray-700 font-b3" style={{ includeFontPadding: false }}>
            {message}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
