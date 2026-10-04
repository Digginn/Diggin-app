import { type ReactNode, useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal as NativeModal,
  Platform,
  Pressable,
  View,
} from "react-native";

import { ToastText } from "@/components/ToastText";

export type ModalProps = {
  children: ReactNode;
  visible: boolean;
  onRequestClose: () => void;
  isKeyboardAvoiding?: boolean;
  keyboardGap?: number;
  onShow?: () => void;
  overlay?: ReactNode;
  isFullScreen?: boolean;
  className?: string;
  contentClassName?: string;
  scrimOpacity?: number;
  backdropClassName?: string;
  toastMessage?: string;
  onToastDismiss?: () => void;
};

export function Modal({
  children,
  visible,
  onRequestClose,
  isKeyboardAvoiding = false,
  keyboardGap = 40,
  onShow,
  overlay,
  isFullScreen = false,
  className,
  contentClassName,
  scrimOpacity = 0.4,
  backdropClassName,
  toastMessage,
  onToastDismiss,
}: ModalProps) {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    if (!isKeyboardAvoiding) return;
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setIsKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setIsKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [isKeyboardAvoiding]);
  const isAboveKeyboard = isKeyboardAvoiding && isKeyboardVisible;
  useEffect(() => {
    if (!visible || !toastMessage) return;
    const timer = setTimeout(() => onToastDismiss?.(), 2000);
    return () => clearTimeout(timer);
  }, [visible, toastMessage, onToastDismiss]);

  return (
    <NativeModal
      animationType="fade"
      onRequestClose={onRequestClose}
      onShow={onShow}
      transparent
      visible={visible}
      statusBarTranslucent={isFullScreen}
      navigationBarTranslucent={isFullScreen}
    >
      <KeyboardAvoidingView enabled={isKeyboardAvoiding} behavior="padding" className="flex-1">
        <View
          className={`flex-1 items-center px-margin ${isAboveKeyboard ? "justify-end" : "justify-center"} ${backdropClassName ?? ""}`}
          style={isAboveKeyboard ? { paddingBottom: keyboardGap } : undefined}
        >
          <View className="absolute inset-0 bg-gray-1000" style={{ opacity: scrimOpacity }} />
          {/* 카드 바깥을 누르면 키보드만 닫는다. 모달은 닫지 않는다. */}
          <Pressable accessible={false} className="absolute inset-0" onPress={Keyboard.dismiss} />
          <View
            className={`w-full max-w-[327px] items-center rounded-field bg-gray-0 shadow-lg ${className ?? "px-2.5 py-4"}`}
          >
            <View className={contentClassName ?? "w-full max-w-[295px] items-center gap-[25px]"}>
              {children}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      {overlay}
      {toastMessage && (
        <View pointerEvents="none" className="absolute inset-x-0 bottom-[160px] items-center">
          <View className="w-full max-w-[327px] items-center">
            <ToastText message={toastMessage} />
          </View>
        </View>
      )}
    </NativeModal>
  );
}
