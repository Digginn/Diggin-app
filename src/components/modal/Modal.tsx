import { type ReactNode, useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal as NativeModal, Platform, View } from "react-native";

export type ModalProps = {
  children: ReactNode;
  visible: boolean;
  onRequestClose: () => void;
  isKeyboardAvoiding?: boolean;
  keyboardGap?: number;
  onShow?: () => void;
  overlay?: ReactNode;
};

export function Modal({
  children,
  visible,
  onRequestClose,
  isKeyboardAvoiding = false,
  keyboardGap = 40,
  onShow,
  overlay,
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
  return (
    <NativeModal
      animationType="fade"
      onRequestClose={onRequestClose}
      onShow={onShow}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView enabled={isKeyboardAvoiding} behavior="padding" className="flex-1">
        <View
          className={`flex-1 items-center px-margin ${isAboveKeyboard ? "justify-end" : "justify-center"}`}
          style={isAboveKeyboard ? { paddingBottom: keyboardGap } : undefined}
        >
          <View className="absolute inset-0 bg-black/40" />
          <View className="w-full max-w-[327px] items-center rounded-[5px] bg-gray-0 px-2.5 py-4 shadow-lg">
            <View className="w-[295px] items-center gap-[25px]">{children}</View>
          </View>
        </View>
      </KeyboardAvoidingView>
      {overlay}
    </NativeModal>
  );
}
