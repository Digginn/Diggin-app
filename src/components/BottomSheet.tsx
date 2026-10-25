import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal as NativeModal,
  PanResponder,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ToastText, type ToastVariant } from "@/components/ToastText";
import { useNativeModalVisible } from "@/hooks/useNativeModalVisible";
import { colors } from "@/theme";

const BOTTOM_PADDING = 40;
// 키보드가 홈 인디케이터 자리를 덮으니 그만큼 여백을 줄인다.
const KEYBOARD_BOTTOM_PADDING = 16;
// 이 거리 이상 끌어내리거나 이 속도 이상으로 튕기면 닫는다.
const DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 0.5;
// 아래로 끄는 게 분명할 때만 제스처를 가져온다.
const DRAG_START = 6;
// 닫을 때 화면 밖으로 밀어내는 거리. 시트 높이를 재지 않아도 되게 넉넉히 잡는다.
const EXIT_DISTANCE = Dimensions.get("window").height;
// Animated.View 로 감싸면 퍼센트 기준이 될 높이가 사라져서 px 로 계산해 둔다.
const MAX_HEIGHT = Dimensions.get("window").height * 0.86;

type BottomSheetProps = {
  children: ReactNode;
  visible: boolean;
  onRequestClose: () => void;
  /** iOS 는 닫히는 중에 다른 모달을 띄우면 무시한다. 이어서 띄울 때 이 시점을 쓴다. */
  onDismiss?: () => void;
  height?: number;
  /** 내용만큼 자라다 이 높이에서 멈춘다. 작은 화면에서는 상태 표시줄 아래까지만 올라온다. */
  maxHeight?: number;
  /** 그래버 아래에 붙어 함께 끌어내리는 손잡이가 된다. 스크롤 목록이 있는 시트의 제목 자리. */
  header?: ReactNode;
  className?: string;
  handleClassName?: string;
  scrimOpacity?: number;
  overlay?: ReactNode;
  isKeyboardAvoiding?: boolean;
  /** 그래버 없이 바로 내용이 시작하는 시트가 있다. 보이면 끌어내려 닫을 수 있다. */
  isGrabberVisible?: boolean;
  /** 입력이 있는 시트는 바깥을 눌러 닫으면 적던 내용이 날아간다. */
  isScrimClosable?: boolean;
  /** 켜져 있으면 끌어내려도 내보내지 않고 제자리로 돌린 뒤 onRequestClose 로 확인을 맡긴다. */
  isCloseConfirmed?: boolean;
  /** 시트가 네이티브 모달이라 바깥 토스트는 가려진다. 시트 위에 띄우려면 여기로 넘긴다. */
  toastMessage?: string;
  toastVariant?: ToastVariant;
  onToastDismiss?: () => void;
  /** 공유 확장은 iOS가 띄운 카드 안에서 돌아 모달을 또 올리지 않고 카드 안에 위부터 그린다. */
  isInline?: boolean;
};

export function BottomSheet({
  onDismiss,
  children,
  visible,
  onRequestClose,
  height,
  maxHeight,
  header,
  className,
  handleClassName,
  scrimOpacity = 0.4,
  overlay,
  isKeyboardAvoiding = true,
  isGrabberVisible = true,
  isScrimClosable = true,
  isCloseConfirmed = false,
  toastMessage,
  toastVariant = "default",
  onToastDismiss,
  isInline = false,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const isNativeVisible = useNativeModalVisible(visible && !isInline);
  const [isKeyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible || !toastMessage) return;
    // 에러는 원인을 읽을 시간이 필요해 시안대로 더 오래 둔다.
    const timer = setTimeout(() => onToastDismiss?.(), toastVariant === "error" ? 4000 : 2000);
    return () => clearTimeout(timer);
  }, [visible, toastMessage, toastVariant, onToastDismiss]);
  const [dragY] = useState(() => new Animated.Value(0));

  // 끌어내린 위치는 열 때만 되돌린다. 닫을 때 되돌리면 모달이 슬라이드로 사라지는 동안
  // 시트가 제자리로 튀어 올라왔다가 닫히는 것처럼 보인다.
  useEffect(() => {
    if (!visible) return;
    dragY.stopAnimation();
    dragY.setValue(0);
  }, [visible, dragY]);

  const dragHandlers = useMemo(() => {
    // 그래버가 보이면 끌어서 닫힌다. 손잡이처럼 생긴 게 안 움직이면 고장으로 보인다.
    // 카드 안에서는 끌어내리기를 iOS 카드가 맡는다.
    if (!isGrabberVisible || isInline) return undefined;

    // setValue 와 애니메이션이 같은 JS 노드를 쓰도록 네이티브 드라이버는 켜지 않는다.
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        gesture.dy > DRAG_START && gesture.dy > Math.abs(gesture.dx),
      onPanResponderGrant: () => Keyboard.dismiss(),
      onPanResponderMove: (_event, gesture) => {
        // 위로 끄는 건 무시한다. 시트는 더 올라가지 않는다.
        if (gesture.dy > 0) dragY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_event, gesture) => {
        const isDismiss = gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY;
        if (isDismiss && isCloseConfirmed) {
          Animated.spring(dragY, { toValue: 0, bounciness: 0, useNativeDriver: false }).start();
          onRequestClose();
          return;
        }
        if (isDismiss) {
          Animated.timing(dragY, {
            toValue: EXIT_DISTANCE,
            duration: 160,
            useNativeDriver: false,
            // 도중에 끊긴 애니메이션까지 닫기로 세면 엉뚱할 때 닫힌다.
          }).start(({ finished }) => {
            if (finished) onRequestClose();
          });
          return;
        }
        Animated.spring(dragY, { toValue: 0, bounciness: 0, useNativeDriver: false }).start();
      },
      onPanResponderTerminationRequest: () => false,
    }).panHandlers;
  }, [dragY, isGrabberVisible, isInline, isCloseConfirmed, onRequestClose]);

  const sheet = (
    <View
      className={`${isInline ? "flex-1" : "rounded-t-2xl"} bg-gray-0 ${className ?? ""}`}
      style={{
        height,
        maxHeight: isInline
          ? undefined
          : maxHeight
            ? Math.min(maxHeight, Dimensions.get("window").height - insets.top)
            : MAX_HEIGHT,
        paddingBottom: isKeyboardVisible
          ? KEYBOARD_BOTTOM_PADDING
          : Math.max(insets.bottom, BOTTOM_PADDING),
        boxShadow: isInline ? undefined : `0px -4px 4px ${colors.gray[1000]}1F`,
      }}
    >
      {/* 그래버와 그 둘레 여백이 끌어내리는 손잡이가 된다. */}
      <View {...dragHandlers} className="pt-3">
        {isGrabberVisible ? (
          <View
            accessibilityElementsHidden
            className={
              handleClassName ?? "mb-5 h-1 w-8 self-center rounded-full bg-gray-500 opacity-40"
            }
            importantForAccessibility="no"
          />
        ) : null}
        {header}
      </View>
      {children}
    </View>
  );
  const toast = toastMessage ? (
    <View pointerEvents="none" className="absolute inset-x-0 bottom-[160px] items-center">
      <View className="w-full max-w-[327px] items-center">
        <ToastText message={toastMessage} variant={toastVariant} />
      </View>
    </View>
  ) : null;

  if (isInline) {
    if (!visible) return null;
    return (
      <KeyboardAvoidingView
        enabled={isKeyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        {sheet}
        {toast}
        {overlay}
      </KeyboardAvoidingView>
    );
  }

  return (
    <NativeModal
      animationType="slide"
      onRequestClose={onRequestClose}
      onDismiss={onDismiss}
      transparent
      visible={isNativeVisible}
    >
      <KeyboardAvoidingView
        enabled={isKeyboardAvoiding}
        // 안드로이드는 adjustResize 로 OS 가 창을 줄여주므로 여기서 또 줄이면 입력란이 밀린다.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end"
      >
        <Pressable
          accessible={isScrimClosable}
          accessibilityLabel={isScrimClosable ? "닫기" : undefined}
          accessibilityRole={isScrimClosable ? "button" : undefined}
          className="absolute inset-0 bg-black"
          style={{ opacity: scrimOpacity }}
          // 닫지 않는 시트에서도 키보드는 내려줘야 가린 버튼을 누를 수 있다.
          onPress={isScrimClosable ? onRequestClose : Keyboard.dismiss}
        />
        <Animated.View style={{ transform: [{ translateY: dragY }] }}>{sheet}</Animated.View>
      </KeyboardAvoidingView>
      {toast}
      {overlay}
    </NativeModal>
  );
}
