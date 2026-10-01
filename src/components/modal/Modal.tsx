import { type ReactNode } from "react";
import { Modal as NativeModal, View } from "react-native";

export type ModalProps = {
  children: ReactNode;
  visible: boolean;
  onRequestClose: () => void;
  scrimClassName?: string;
  isFullScreen?: boolean;
};

export function Modal({
  children,
  visible,
  onRequestClose,
  scrimClassName = "bg-black/40",
  isFullScreen = false,
}: ModalProps) {
  return (
    <NativeModal
      animationType="fade"
      onRequestClose={onRequestClose}
      transparent
      visible={visible}
      statusBarTranslucent={isFullScreen}
      navigationBarTranslucent={isFullScreen}
    >
      <View className="flex-1 items-center justify-center px-margin">
        <View className={`absolute inset-0 ${scrimClassName}`} />
        <View className="w-full max-w-[327px] items-center rounded-[5px] bg-gray-0 px-2.5 py-4 shadow-lg">
          <View className="w-[295px] items-center gap-[25px]">{children}</View>
        </View>
      </View>
    </NativeModal>
  );
}
