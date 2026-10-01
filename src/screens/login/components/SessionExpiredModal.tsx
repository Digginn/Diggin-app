import { Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Modal } from "@/components/modal";

type SessionExpiredModalProps = {
  visible: boolean;
  onLater: () => void;
  onLogin: () => void;
};

export function SessionExpiredModal({ visible, onLater, onLogin }: SessionExpiredModalProps) {
  return (
    <Modal visible={visible} onRequestClose={onLater} scrimClassName="bg-black/[0.36]" isFullScreen>
      <View className="-mt-2 w-full items-center gap-1">
        <View className="h-12 w-full items-center justify-center">
          <Text
            className="text-center text-gray-900 font-label-16-semibold"
            style={{ includeFontPadding: false }}
          >
            다시 로그인해주세요.
          </Text>
        </View>
        <Text className="text-center text-gray-700 font-b3" style={{ includeFontPadding: false }}>
          {"로그인 정보가 만료되어\n다시 로그인이 필요합니다."}
        </Text>
      </View>
      <View className="w-full flex-row gap-[15px]">
        <Button variant="secondary" className="flex-1" onPress={onLater}>
          다음에 할게요
        </Button>
        <Button className="flex-1" onPress={onLogin}>
          로그인하기
        </Button>
      </View>
    </Modal>
  );
}
