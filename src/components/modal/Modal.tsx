import { useEffect, type ReactNode } from "react";
import { Keyboard, Modal as NativeModal, Pressable, View } from "react-native";

import { ToastText } from "@/components/ToastText";

export type ModalProps = {
  children: ReactNode;
  visible: boolean;
  onRequestClose: () => void;
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
  isFullScreen = false,
  className,
  contentClassName,
  scrimOpacity = 0.4,
  backdropClassName,
  toastMessage,
  onToastDismiss,
}: ModalProps) {
  useEffect(() => {
    if (!visible || !toastMessage) return;
    const timer = setTimeout(() => onToastDismiss?.(), 2000);
    return () => clearTimeout(timer);
  }, [visible, toastMessage, onToastDismiss]);

  return (
    <NativeModal
      animationType="fade"
      onRequestClose={onRequestClose}
      transparent
      visible={visible}
      statusBarTranslucent={isFullScreen}
      navigationBarTranslucent={isFullScreen}
    >
      {/* 버튼과 입력은 각자 터치를 가져가므로 여기까지 올라오지 않는다. */}
      <Pressable
        accessible={false}
        className={`flex-1 items-center justify-center px-margin ${backdropClassName ?? ""}`}
        onPress={Keyboard.dismiss}
      >
        <View className="absolute inset-0 bg-gray-1000" style={{ opacity: scrimOpacity }} />
        <View
          className={`w-full max-w-[327px] items-center rounded-field bg-gray-0 shadow-lg ${className ?? "px-2.5 py-4"}`}
        >
          <View className={contentClassName ?? "w-full max-w-[295px] items-center gap-[25px]"}>
            {children}
          </View>
        </View>
        {toastMessage && (
          <View pointerEvents="none" className="absolute inset-x-0 bottom-[160px] items-center">
            <View className="w-full max-w-[327px] items-center">
              <ToastText message={toastMessage} />
            </View>
          </View>
        )}
      </Pressable>
    </NativeModal>
  );
}
