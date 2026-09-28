import { type ReactNode } from "react";
import { Modal as NativeModal, View } from "react-native";

export type ModalProps = {
  children: ReactNode;
  visible: boolean;
  onRequestClose: () => void;
};

export function Modal({ children, visible, onRequestClose }: ModalProps) {
  return (
    <NativeModal animationType="fade" onRequestClose={onRequestClose} transparent visible={visible}>
      <View className="flex-1 items-center justify-center px-margin">
        <View className="absolute inset-0 bg-black/40" />
        <View className="w-full max-w-[327px] items-center rounded-[5px] bg-gray-0 px-2.5 py-4 shadow-lg">
          <View className="w-[295px] items-center gap-[25px]">{children}</View>
        </View>
      </View>
    </NativeModal>
  );
}
