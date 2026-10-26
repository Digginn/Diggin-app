import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "@/components/app-bar";
import { Toggle } from "@/components/Toggle";
import { useToast } from "@/hooks/useToast";
import { PushOffBanner } from "@/screens/notification/components/PushOffBanner";

export type NotificationSettings = {
  isAllEnabled: boolean;
  isVoteEndEnabled: boolean;
  isCommentEnabled: boolean;
  isLikeEnabled: boolean;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  isAllEnabled: true,
  isVoteEndEnabled: true,
  isCommentEnabled: true,
  isLikeEnabled: true,
};
type NotificationSettingsScreenProps = {
  initialSettings?: NotificationSettings;
  onSaveSettings?: (settings: NotificationSettings) => Promise<void>;
  isDevicePushEnabled?: boolean;
  onOpenNotificationSettings?: () => void;
};

export function NotificationSettingsScreen({
  initialSettings = DEFAULT_SETTINGS,
  onSaveSettings,
  isDevicePushEnabled,
  onOpenNotificationSettings,
}: NotificationSettingsScreenProps = {}) {
  const showToast = useToast();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleChange = async (key: keyof NotificationSettings, isEnabled: boolean) => {
    if (!isDevicePushEnabled || isSavingRef.current) return;
    const previous = settings;
    const next = { ...settings, [key]: isEnabled };
    setSettings(next);
    // UI 퍼블리싱 단계에서는 로컬 상태만 변경합니다. 실제 저장은 사용처 콜백으로 연결합니다.
    if (!onSaveSettings) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await onSaveSettings(next);
    } catch {
      if (isMounted.current) {
        setSettings(previous);
        showToast("알림 설정을 저장하지 못했습니다. 다시 시도해 주세요.");
      }
    } finally {
      isSavingRef.current = false;
      if (isMounted.current) setIsSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <AppBar title="알림 설정" />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {isDevicePushEnabled === false && (
          <PushOffBanner
            title="기기 알림이 꺼져 있습니다."
            description="알림을 받으려면 기기 설정에서 알림을 허용해 주세요."
            onOpenSettings={onOpenNotificationSettings}
          />
        )}
        <View className="px-margin pt-6">
          <View className="flex-row items-center border-b border-gray-300 px-2">
            <View className="flex-1 gap-0.5 py-3">
              <Text className="text-gray-800 font-b1">푸시 알림</Text>
              <Text className="text-gray-600 font-note">
                투표 종료, 댓글, 좋아요 소식을 알려드립니다.
              </Text>
            </View>
            <Toggle
              accessibilityLabel="푸시 알림"
              isOn={isDevicePushEnabled === true && settings.isAllEnabled}
              isDisabled={!isDevicePushEnabled || isSaving}
              onChange={(value) => handleChange("isAllEnabled", value)}
            />
          </View>
          <Text className="mt-3 px-2 text-gray-600 font-note">
            푸시 알림을 꺼도 알림함에서 확인할 수 있습니다.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
