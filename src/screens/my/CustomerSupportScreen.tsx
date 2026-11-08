import * as Application from "expo-application";
import * as Device from "expo-device";
import * as MailComposer from "expo-mail-composer";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { Linking, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSupportKakaoBadge, ImageSupportApp } from "@/assets/images/my";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { TOAST_MESSAGES } from "@/constants/messages";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme";

import { SUPPORT_CHANNEL_URL, SUPPORT_EMAIL } from "./constants/supportChannel";
import { buildSupportEmail } from "./utils/supportEmail";

// 조회가 늦어도 메일 작성은 막지 않는다.
const NICKNAME_TIMEOUT_MS = 1500;

async function readNickname(userId: string | undefined) {
  if (!userId) return null;
  const { data } = await supabase.from("profiles").select("nickname").eq("id", userId).single();
  return data?.nickname ?? null;
}

export function CustomerSupportScreen() {
  const insets = useSafeAreaInsets();
  const showToast = useToast();
  const { session } = useAuth();
  const userId = session?.user.id;
  const nickname = useRef<Promise<string | null> | null>(null);

  // 버튼을 누르기 전에 미리 받아 둔다.
  useEffect(() => {
    nickname.current = readNickname(userId).catch(() => null);
  }, [userId]);

  // MY-012 OS가 URL 열기 요청 자체를 거절한 경우에만 안내한다.
  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      showToast(TOAST_MESSAGES.SYS_002);
    }
  };

  // iOS 기본 메일 앱에 계정이 있으면 앱 안 작성 시트를, 없으면 기본 메일 앱(Gmail 등)을 연다.
  const sendEmail = async () => {
    nickname.current ??= readNickname(userId).catch(() => null);
    const name = await Promise.race([
      nickname.current,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), NICKNAME_TIMEOUT_MS)),
    ]);
    const { subject, body } = buildSupportEmail({
      // 로그인했는데 닉네임을 못 받으면 비회원으로 적지 않는다.
      nickname: name ?? (userId ? "-" : null),
      appVersion: Application.nativeApplicationVersion,
      buildNumber: Application.nativeBuildVersion,
      os: Platform.OS === "android" ? "android" : "ios",
      osName: Device.osName,
      osVersion: Device.osVersion,
      apiLevel: Device.platformApiLevel,
      model: Device.modelName,
      manufacturer: Device.manufacturer,
    });
    try {
      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync({ recipients: [SUPPORT_EMAIL], subject, body });
        return;
      }
    } catch {
      // 작성 시트를 못 띄우면 메일 링크로 한 번 더 시도한다.
    }
    await open(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    );
  };

  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <AppBar title="고객 지원" titleClassName="font-label-20" />
      {/* 글자 크기를 키운 작은 화면에서도 안내가 잘리지 않게 공간이 부족할 때만 스크롤한다. */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow items-center justify-center px-margin"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center gap-4">
          <View className="size-20">
            <ImageSupportApp accessibilityLabel="디긴 로고" />
            <View className="absolute left-16 top-[-15px]">
              <IconSupportKakaoBadge />
            </View>
          </View>
          <View className="items-center gap-1.5">
            <Text className="text-center text-gray-900 font-label-16-medium">@archive_diggin</Text>
            <Text className="text-center text-gray-500 font-label-16-semibold">
              {"카카오 채널 1:1 상담 또는 이메일로\n문의하실 수 있습니다."}
            </Text>
          </View>
        </View>
      </ScrollView>
      <View className="gap-2 px-margin pt-3" style={{ paddingBottom: Math.max(insets.bottom, 34) }}>
        <Button onPress={() => void open(SUPPORT_CHANNEL_URL)}>카카오톡 채널 열기</Button>
        <Button
          variant="secondary"
          bgColor={colors.gray[0]}
          className="border-[1.5px] border-gray-900"
          onPress={() => void sendEmail()}
        >
          이메일 보내기
        </Button>
      </View>
    </View>
  );
}
