import { useEffect, type ReactNode } from "react";
import { Modal as NativeModal, View } from "react-native";

import { ToastText } from "@/components/ToastText";

export type ModalProps = {
  children: ReactNode;
  visible: boolean;
  onRequestClose: () => void;
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
    <NativeModal animationType="fade" onRequestClose={onRequestClose} transparent visible={visible}>
      <View className={`flex-1 items-center justify-center px-margin ${backdropClassName ?? ""}`}>
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
      </View>
    </NativeModal>
  );
}
