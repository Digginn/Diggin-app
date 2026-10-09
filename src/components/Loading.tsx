import { cssInterop } from "nativewind";
import { useEffect } from "react";
import { Modal, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import IndicatorSvg from "@/assets/images/icon-spinner-indicator.svg";
import TrackSvg from "@/assets/images/icon-spinner-track.svg";

const TrackIcon = cssInterop(TrackSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});
const IndicatorIcon = cssInterop(IndicatorSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

const SPINNER_SIZE = 32;
const ROTATION_DURATION = 800;
// 트랙 에셋이 29 라 32 안에서 가운데로 들여 그림
const TRACK_SIZE = 29;
const TRACK_INSET = (SPINNER_SIZE - TRACK_SIZE) / 2;

export function Spinner() {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: ROTATION_DURATION, easing: Easing.linear }),
      -1,
      false,
    );
  }, [rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View className="size-8">
      <View className="absolute" style={{ top: TRACK_INSET, left: TRACK_INSET }}>
        <TrackIcon width={TRACK_SIZE} height={TRACK_SIZE} />
      </View>
      <Animated.View style={spinStyle}>
        <IndicatorIcon width={SPINNER_SIZE} height={SPINNER_SIZE} />
      </Animated.View>
    </View>
  );
}

type LoadingDialogProps = {
  visible: boolean;
  message: string;
  /** iOS 는 닫히는 중에 다른 모달을 띄우면 무시한다. 이어서 띄울 때 이 시점을 쓴다. */
  onDismiss?: () => void;
};

export function LoadingDialog({ visible, message, onDismiss }: LoadingDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onDismiss={onDismiss}
    >
      <View className="flex-1 items-center justify-center">
        <View className="absolute inset-0 bg-black/[0.36]" />
        <View
          accessibilityLiveRegion="polite"
          className="w-60 items-center justify-center gap-4 rounded-lg bg-gray-0 px-6 py-7"
        >
          <Spinner />
          <Text className="w-full text-center text-gray-700 font-b3">{message}</Text>
        </View>
      </View>
    </Modal>
  );
}
