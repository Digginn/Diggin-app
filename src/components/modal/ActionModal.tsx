import { cssInterop } from "nativewind";
import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import CloseSvg from "@/assets/images/icon-modal-close.svg";

import { Modal, type ModalProps } from "./Modal";
import { ModalButton, type ModalAction } from "./ModalButton";

type ActionModalProps = Omit<ModalProps, "children"> & {
  type?: "1Btn" | "2Btn";
  title: string;
  description?: string;
  children?: ReactNode;
  onClose?: () => void;
  primaryAction: ModalAction;
  secondaryAction?: ModalAction;
};

const CloseIcon = cssInterop(CloseSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

export function ActionModal({
  visible,
  onRequestClose,
  type = "1Btn",
  title,
  description,
  children,
  onClose,
  primaryAction,
  secondaryAction,
}: ActionModalProps) {
  const isTwoButton = type === "2Btn" && secondaryAction;
  const hasCloseButton = type === "1Btn" && onClose !== undefined;

  return (
    <Modal visible={visible} onRequestClose={onRequestClose}>
      <View className={`w-[295px] items-center gap-[30px] ${hasCloseButton ? "-mt-2" : ""}`}>
        <View className="w-[295px] items-center gap-1">
          {hasCloseButton ? (
            <View className="w-[295px] flex-row items-center overflow-hidden">
              <View className="size-12" />
              <Text className="flex-1 text-center text-gray-900 font-label-16-semibold">
                {title}
              </Text>
              <Pressable
                accessibilityLabel="모달 닫기"
                className="size-12 items-center justify-center overflow-hidden"
                onPress={onClose}
              >
                <View className="size-4 items-center justify-center overflow-hidden">
                  <CloseIcon className="size-4" />
                </View>
              </Pressable>
            </View>
          ) : (
            <Text className="text-center text-gray-900 font-label-16-semibold">{title}</Text>
          )}
          {description && <Text className="text-center text-gray-700 font-b3">{description}</Text>}
        </View>
        {children}
      </View>
      {isTwoButton ? (
        <View className="w-[295px] flex-row gap-[15px]">
          <View className="w-[140px]">
            <ModalButton action={secondaryAction} variant="secondary" />
          </View>
          <View className="w-[140px]">
            <ModalButton action={primaryAction} />
          </View>
        </View>
      ) : (
        <View className="w-[295px]">
          <ModalButton action={primaryAction} variant="disabled" />
        </View>
      )}
    </Modal>
  );
}
