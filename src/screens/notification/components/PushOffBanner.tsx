import { Pressable, Text, View } from "react-native";

import CloseIcon from "@/assets/images/icon-notification-banner-close.svg";
import { Button } from "@/components/Button";

type PushOffBannerProps = {
  onClose: () => void;
  onOpenSettings?: () => void;
};

export function PushOffBanner({ onClose, onOpenSettings }: PushOffBannerProps) {
  return (
    <View className="px-margin pb-4 pt-2">
      <View className="gap-1 rounded-lg bg-gray-100 p-4">
        <View className="gap-1 pr-6">
          <Text className="text-gray-900 font-label-14">기기 알림이 꺼져 있어요.</Text>
          <Text className="text-gray-700 font-b4">
            알림을 받으려면 기기 설정에서 알림을 허용해주세요.
          </Text>
        </View>
        <View className="pt-2">
          <Button onPress={() => onOpenSettings?.()} isDisabled={!onOpenSettings}>
            설정으로 이동
          </Button>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="기기 알림 안내 7일 동안 닫기"
          className="absolute -right-1 -top-1 size-12 items-center justify-center"
          onPress={onClose}
        >
          <View className="size-4 items-center justify-center">
            <CloseIcon />
          </View>
        </Pressable>
      </View>
    </View>
  );
}
