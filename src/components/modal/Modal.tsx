import { type ReactNode } from "react";
import { Modal as NativeModal, View } from "react-native";

export type ModalProps = {
  children: ReactNode;
  visible: boolean;
  onRequestClose: () => void;
  className?: string;
  contentClassName?: string;
  scrimOpacity?: number;
  backdropClassName?: string;
};

export function Modal({
  children,
  visible,
  onRequestClose,
  className,
  contentClassName,
  scrimOpacity = 0.4,
  backdropClassName,
}: ModalProps) {
  return (
    <NativeModal animationType="fade" onRequestClose={onRequestClose} transparent visible={visible}>
      <View className={`flex-1 items-center justify-center px-margin ${backdropClassName ?? ""}`}>
        <View className="absolute inset-0 bg-gray-1000" style={{ opacity: scrimOpacity }} />
        <View
          className={`w-full max-w-[327px] items-center rounded-[5px] bg-gray-0 shadow-lg ${className ?? "px-2.5 py-4"}`}
        >
          <View className={contentClassName ?? "w-full max-w-[295px] items-center gap-[25px]"}>
            {children}
          </View>
        </View>
      </View>
    </NativeModal>
  );
}
