import type { ReactNode } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal as NativeModal,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/theme";

const BOTTOM_PADDING = 32;

type BottomSheetProps = {
  children: ReactNode;
  visible: boolean;
  onRequestClose: () => void;
  height?: number;
  className?: string;
  handleClassName?: string;
  scrimOpacity?: number;
  overlay?: ReactNode;
  isKeyboardAvoiding?: boolean;
  /** 그래버 없이 바로 내용이 시작하는 시트가 있다. */
  isGrabberVisible?: boolean;
  /** 입력이 있는 시트는 바깥을 눌러 닫으면 적던 내용이 날아간다. */
  isScrimClosable?: boolean;
};

export function BottomSheet({
  children,
  visible,
  onRequestClose,
  height,
  className,
  handleClassName,
  scrimOpacity = 0.4,
  overlay,
  isKeyboardAvoiding = true,
  isGrabberVisible = true,
  isScrimClosable = true,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <NativeModal
      animationType="slide"
      onRequestClose={onRequestClose}
      transparent
      visible={visible}
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
        <View
          className={`max-h-[86%] rounded-t-2xl bg-gray-0 pt-3 ${className ?? ""}`}
          style={{
            height,
            paddingBottom: Math.max(insets.bottom, BOTTOM_PADDING),
            boxShadow: `0px -4px 4px ${colors.gray[1000]}1F`,
          }}
        >
          {isGrabberVisible ? (
            <View
              accessibilityElementsHidden
              className={
                handleClassName ?? "mb-5 h-1 w-8 self-center rounded-full bg-gray-500 opacity-40"
              }
              importantForAccessibility="no"
            />
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
      {overlay}
    </NativeModal>
  );
}
