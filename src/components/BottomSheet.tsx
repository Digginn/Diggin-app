import type { ReactNode } from "react";
import {
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
};

export function BottomSheet({ children, visible, onRequestClose }: BottomSheetProps) {
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
          className="absolute inset-0 bg-black/40"
          onPress={onRequestClose}
        />
        <View
          className="max-h-[86%] rounded-t-2xl bg-gray-0 pt-3"
          style={{
            paddingBottom: Math.max(insets.bottom, BOTTOM_PADDING),
            boxShadow: `0px -4px 4px ${colors.gray[1000]}1F`,
          }}
        >
          <View
            accessibilityElementsHidden
            className="mb-5 h-1 w-8 self-center rounded-full bg-gray-500 opacity-40"
            importantForAccessibility="no"
          />
          {children}
        </View>
      </KeyboardAvoidingView>
    </NativeModal>
  );
}
