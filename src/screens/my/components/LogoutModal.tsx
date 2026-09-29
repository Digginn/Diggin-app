import { Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Modal } from "@/components/modal";

type LogoutModalProps = {
  isVisible: boolean;
  isLoggingOut: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function LogoutModal({ isVisible, isLoggingOut, onClose, onConfirm }: LogoutModalProps) {
  return (
    <Modal
      visible={isVisible}
      onRequestClose={onClose}
      scrimOpacity={0.36}
      className="px-4 pb-4 pt-2"
    >
      <View className="w-full items-center gap-1">
        <View className="h-12 justify-center">
          <Text className="text-center text-gray-900 font-label-16-semibold">
            로그아웃하시겠습니까?
          </Text>
        </View>
        <Text className="text-center text-gray-700 font-b3">
          저장된 정보는 안전하게 보관됩니다.
        </Text>
      </View>
      <View className="w-full flex-row gap-[15px]">
        <View className="flex-1">
          <Button variant="secondary" isDisabled={isLoggingOut} onPress={onClose}>
            돌아가기
          </Button>
        </View>
        <View className="flex-1">
          <Button isDisabled={isLoggingOut} onPress={onConfirm}>
            로그아웃
          </Button>
        </View>
      </View>
    </Modal>
  );
}
