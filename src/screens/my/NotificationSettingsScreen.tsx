import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "@/components/app-bar";
import { Toggle } from "@/components/Toggle";
import { useToast } from "@/hooks/useToast";

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
const ROWS: { key: keyof NotificationSettings; label: string }[] = [
  { key: "isAllEnabled", label: "전체 알림" },
  { key: "isVoteEndEnabled", label: "투표 종료 알림" },
  { key: "isCommentEnabled", label: "게시글 댓글 알림" },
  { key: "isLikeEnabled", label: "게시글 좋아요 알림" },
];

type NotificationSettingsScreenProps = {
  initialSettings?: NotificationSettings;
  onSaveSettings?: (settings: NotificationSettings) => Promise<void>;
};

export function NotificationSettingsScreen({
  initialSettings = DEFAULT_SETTINGS,
  onSaveSettings,
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
    if (isSavingRef.current) return;
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
      <AppBar title="알림 설정" titleClassName="font-label-20-medium" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-margin pt-6"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {ROWS.map(({ key, label }) => {
          const isMaster = key === "isAllEnabled";
          // 전체 알림에는 공지 알림도 포함합니다. 하위 선택은 전체 알림을 다시 켤 때 복원합니다.
          const isOn = isMaster ? settings.isAllEnabled : settings.isAllEnabled && settings[key];
          return (
            <View key={key} className="h-12 flex-row items-center border-b border-gray-300 px-2">
              <Text className="flex-1 text-gray-800 font-b1">{label}</Text>
              <Toggle
                accessibilityLabel={label}
                isOn={isOn}
                isDisabled={isSaving || (!isMaster && !settings.isAllEnabled)}
                onChange={(value) => handleChange(key, value)}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
