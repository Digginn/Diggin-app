import { useRouter, type Href } from "expo-router";
import { useRef, useState, type FC } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import type { SvgProps } from "react-native-svg";

import { IconMyProfile, IconMySettings, IconMySupport } from "@/assets/images/my";
import { AppBar } from "@/components/app-bar";

import { AccountWithdrawalModal } from "./components/AccountWithdrawalModal";
import { LogoutModal } from "./components/LogoutModal";
import { MyMenuList, type MyMenuRow } from "./components/MyMenuList";
import { SUPPORT_CHANNEL_URL } from "./constants/supportChannel";

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

      <MyMenuList rows={rows} />
    </View>
  );
}

type MyScreenProps = {
  onLogout?: () => Promise<void>;
  onWithdraw?: () => Promise<void>;
};

export function MyScreen({ onLogout, onWithdraw }: MyScreenProps = {}) {
  const router = useRouter();
  const [modalToast, setModalToast] = useState<string>();
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isWithdrawalOpen, setIsWithdrawalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isLoggingOutRef = useRef(false);
  const handleCloseLogout = () => {
    if (!isLoggingOutRef.current) {
      setIsLogoutOpen(false);
      setModalToast(undefined);
    }
  };
  const handleLogout = async () => {
    if (isLoggingOutRef.current) return;
    if (!onLogout) {
      setModalToast("로그아웃 기능은 준비 중입니다.");
      return;
    }
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);
    try {
      await onLogout();
      setIsLogoutOpen(false);
      setModalToast(undefined);
    } catch {
      setModalToast("로그아웃하지 못했습니다. 다시 시도해 주세요.");
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
    {
      label: "CSV 파일로 위시 아이템 불러오기",
      onPress: () => router.push("/csv-import" as Href),
      onLongPress: __DEV__ ? () => router.push("/csv-import-preview" as Href) : undefined,
    },
    { label: "앱 정보", value: "1.0.0 (100)", hasChevron: false },
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
          rows={[
            { label: "프로필 수정", onPress: () => router.push("/profile-edit" as Href) },
            { label: "내 활동", onPress: () => router.push("/my-activity" as Href) },
          ]}
        />
        <MySection title="고객지원" Icon={IconMySupport} rows={supportRows} />
        <MySection title="설정" Icon={IconMySettings} rows={settingsRows} />
      </ScrollView>
      <LogoutModal
        isVisible={isLogoutOpen}
        isLoggingOut={isLoggingOut}
        onClose={handleCloseLogout}
        onConfirm={handleLogout}
        toastMessage={modalToast}
        onToastDismiss={() => setModalToast(undefined)}
      />
      <AccountWithdrawalModal
        isVisible={isWithdrawalOpen}
        onClose={() => setIsWithdrawalOpen(false)}
        onWithdraw={onWithdraw}
      />
    </View>
  );
}
