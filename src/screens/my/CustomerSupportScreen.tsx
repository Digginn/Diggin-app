import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ImageSupportApp } from "@/assets/images/my";
import { AppBar } from "@/components/app-bar";
import { useToast } from "@/hooks/useToast";

import { SUPPORT_CHANNEL_URL } from "./constants/supportChannel";

export function CustomerSupportScreen() {
  const insets = useSafeAreaInsets();
  const showToast = useToast();

  const handleOpenChannel = async () => {
    try {
      await Linking.openURL(SUPPORT_CHANNEL_URL);
    } catch {
      showToast("카카오 채널로 이동하지 못했습니다. 링크를 복사해 주세요.");
    }
  };

  const handleCopyLink = async () => {
    try {
      const isCopied = await Clipboard.setStringAsync(SUPPORT_CHANNEL_URL);
      showToast(
        isCopied ? "링크를 복사했습니다." : "링크를 복사하지 못했습니다. 다시 시도해 주세요.",
      );
    } catch {
      showToast("링크를 복사하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <AppBar title="고객 지원" titleClassName="font-label-20-medium" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="items-center px-margin pt-[150px]"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center gap-3">
          <ImageSupportApp accessibilityLabel="디긴 로고" />
          <Text className="text-center text-gray-900 font-label-16-medium">디긴 - diggin</Text>
        </View>
        <View className="mt-6 h-10 w-[280px] max-w-full flex-row items-center rounded-[5px] bg-gray-100 p-1">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="카카오 고객지원 채널 열기"
            onPress={handleOpenChannel}
            className="h-full flex-1 justify-center pl-1.5"
            hitSlop={{ top: 4, bottom: 4 }}
          >
            <Text numberOfLines={1} className="text-gray-500 font-b3">
              {SUPPORT_CHANNEL_URL}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="고객지원 링크 복사"
            onPress={handleCopyLink}
            hitSlop={{ top: 8, bottom: 8 }}
            className="rounded-[5px] bg-gray-900 px-2.5 py-1.5"
          >
            <Text className="text-gray-0 font-b3">링크 복사</Text>
          </Pressable>
        </View>
        <Text className="mt-[35px] text-center text-gray-800 font-label-16-semibold">
          {"모든 문의는 카카오 채널\n1:1 상담을 통해 이루어집니다."}
        </Text>
      </ScrollView>
    </View>
  );
}
