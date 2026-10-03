import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal as NativeModal,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type BottomSheetProps = {
  children: ReactNode;
  visible: boolean;
  bottomPadding?: number;
  showGrabber?: boolean;
  onRequestClose: () => void;
};

export function BottomSheet({
  children,
  visible,
  bottomPadding = 34,
  showGrabber = false,
  onRequestClose,
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end"
      >
        <Pressable
          accessibilityLabel="닫기"
          accessibilityRole="button"
          className="absolute inset-0 bg-black/[0.36]"
          onPress={onRequestClose}
        />
        <View
          className="max-h-[86%] rounded-t-[20px] bg-gray-0"
          style={{ paddingBottom: Math.max(insets.bottom, bottomPadding) }}
        >
          {showGrabber ? (
            <View
              accessibilityElementsHidden
              className="mb-5 mt-3 h-1 w-8 self-center rounded-full bg-gray-500 opacity-40"
              importantForAccessibility="no"
            />
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </NativeModal>
  );
}
