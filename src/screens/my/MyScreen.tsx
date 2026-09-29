import { useRouter, type Href } from "expo-router";
import { useRef, useState, type FC } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import type { SvgProps } from "react-native-svg";

import {
  IconMyActivity,
  IconMyChevron,
  IconMyProfile,
  IconMySettings,
  IconMySupport,
} from "@/assets/images/my";
import { AppBar } from "@/components/app-bar";
import { useToast } from "@/hooks/useToast";

import { AccountWithdrawalModal } from "./components/AccountWithdrawalModal";
import { LogoutModal } from "./components/LogoutModal";
import { SUPPORT_CHANNEL_URL } from "./constants/supportChannel";

type MyMenuRow = {
  label: string;
  value?: string;
  hasChevron?: boolean;
  hasDivider?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

type MySectionProps = {
  title: string;
  Icon: FC<SvgProps>;
  rows: MyMenuRow[];
};

function MySection({ title, Icon, rows }: MySectionProps) {
  return (
    <View className="w-full">
      <View className="gap-2.5">
        <View className="flex-row items-start gap-2">
          <View className="h-6 w-6 items-center justify-center">
            <Icon width={24} height={24} />
          </View>
          <Text className="text-gray-900 font-label-16-semibold">{title}</Text>
        </View>
        <View className="h-0.5 w-full bg-gray-900" />
      </View>

      <View className="px-2">
        {rows.map((row) => {
          const hasDivider = row.hasDivider ?? true;

          return (
            <Pressable
              key={row.label}
              accessibilityRole={row.onPress ? "button" : undefined}
              disabled={!row.onPress}
              onPress={row.onPress}
              onLongPress={row.onLongPress}
              className={`h-12 flex-row items-center justify-between ${hasDivider ? "border-b border-gray-300" : ""}`}
            >
              <Text numberOfLines={1} className="flex-1 text-gray-800 font-b3">
                {row.label}
              </Text>
              {row.value ? (
                <Text className="text-gray-800 font-meta">{row.value}</Text>
              ) : row.hasChevron !== false ? (
                <View className="h-6 w-6 items-center justify-center">
                  <View style={{ transform: [{ scaleX: -1 }] }}>
                    <IconMyChevron width={18} height={18} />
                  </View>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type MyScreenProps = {
  onLogout?: () => Promise<void>;
  onWithdraw?: () => Promise<void>;
};

export function MyScreen({ onLogout, onWithdraw }: MyScreenProps = {}) {
  const router = useRouter();
  const showToast = useToast();
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isWithdrawalOpen, setIsWithdrawalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isLoggingOutRef = useRef(false);
  const handleCloseLogout = () => {
    if (!isLoggingOutRef.current) setIsLogoutOpen(false);
  };
  const handleLogout = async () => {
    if (isLoggingOutRef.current) return;
    if (!onLogout) {
      showToast("로그아웃 기능은 준비 중입니다.");
      return;
    }
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);
    try {
      await onLogout();
      setIsLogoutOpen(false);
    } catch {
      showToast("로그아웃하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      isLoggingOutRef.current = false;
      setIsLoggingOut(false);
    }
  };
  const handleContactSupport = async () => {
    try {
      await Linking.openURL(SUPPORT_CHANNEL_URL);
    } catch {
      router.push("/customer-support" as Href);
    }
  };
  const supportRows: MyMenuRow[] = [
    {
      label: "1:1 문의",
      onPress: handleContactSupport,
      // 개발 중에는 길게 눌러 채널 이동 실패 화면을 확인합니다.
      onLongPress: __DEV__ ? () => router.push("/customer-support" as Href) : undefined,
    },
    { label: "이용약관", onPress: () => router.push("/terms" as Href) },
    { label: "앱 정보", value: "버전명", hasChevron: false, hasDivider: false },
  ];
  const settingsRows: MyMenuRow[] = [
    {
      label: "알림 설정",
      onPress: () => router.push("/notification-settings" as Href),
      onLongPress: __DEV__
        ? () => router.push("/notification-settings-preview" as Href)
        : undefined,
    },
    { label: "로그아웃", onPress: () => setIsLogoutOpen(true) },
    {
      label: "회원 탈퇴",
      onPress: () => setIsWithdrawalOpen(true),
      onLongPress: __DEV__ ? () => router.push("/account-withdrawal-preview" as Href) : undefined,
    },
  ];
  const activityRows: MyMenuRow[] = [
    { label: "내가 쓴 글", onPress: () => router.push("/my-posts" as Href) },
    { label: "내가 투표한 글", onPress: () => router.push("/my-voted-posts" as Href) },
    {
      label: "CSV 파일로 관심 상품 불러오기",
      onPress: () => router.push("/csv-import" as Href),
      // 개발 중에는 길게 눌러 API 없이 결과 시안을 확인합니다.
      onLongPress: __DEV__ ? () => router.push("/csv-import-preview" as Href) : undefined,
    },
  ];

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar left="none" title="MY" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-margin pb-6 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <MySection
          title="프로필"
          Icon={IconMyProfile}
          rows={[{ label: "프로필 수정", onPress: () => router.push("/profile-edit" as Href) }]}
        />
        <MySection title="활동" Icon={IconMyActivity} rows={activityRows} />
        <MySection title="고객지원" Icon={IconMySupport} rows={supportRows} />
        <MySection title="설정" Icon={IconMySettings} rows={settingsRows} />
      </ScrollView>
      <LogoutModal
        isVisible={isLogoutOpen}
        isLoggingOut={isLoggingOut}
        onClose={handleCloseLogout}
        onConfirm={handleLogout}
      />
      <AccountWithdrawalModal
        isVisible={isWithdrawalOpen}
        onClose={() => setIsWithdrawalOpen(false)}
        onWithdraw={onWithdraw}
      />
    </View>
  );
}
