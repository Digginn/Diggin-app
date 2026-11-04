import * as MailComposer from "expo-mail-composer";
import { StatusBar } from "expo-status-bar";
import { Linking, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSupportKakaoBadge, ImageSupportApp } from "@/assets/images/my";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { TOAST_MESSAGES } from "@/constants/messages";
import { useToast } from "@/hooks/useToast";
import { colors } from "@/theme";

import { SUPPORT_CHANNEL_URL, SUPPORT_EMAIL } from "./constants/supportChannel";

export function CustomerSupportScreen() {
  const insets = useSafeAreaInsets();
  const showToast = useToast();

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
    try {
      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync({ recipients: [SUPPORT_EMAIL] });
        return;
      }
    } catch {
      // 작성 시트를 못 띄우면 메일 링크로 한 번 더 시도한다.
    }
    await open(`mailto:${SUPPORT_EMAIL}`);
  };

  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <AppBar title="고객 지원" titleClassName="font-label-20" />
      <View className="flex-1 items-center justify-center px-margin">
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
      </View>
      <View className="gap-2 px-margin pt-3" style={{ paddingBottom: Math.max(insets.bottom, 34) }}>
        <Button
          variant="secondary"
          bgColor={colors.gray[0]}
          className="border-[1.5px] border-gray-900"
          onPress={() => void open(SUPPORT_CHANNEL_URL)}
        >
          카카오톡 채널 열기
        </Button>
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
