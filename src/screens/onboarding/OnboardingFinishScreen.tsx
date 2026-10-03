import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";

type OnboardingFinishScreenProps = {
  mode: "guest" | "signed-up";
};

function ProductArtwork() {
  return (
    <View className="absolute inset-x-0 top-[351px] h-[145px]" accessible={false}>
      <View
        className="absolute left-1/2 top-[17px] size-[114px] items-center justify-center rounded-field border border-gray-100 bg-[#EEEEEE]/40"
        style={{ marginLeft: -192, transform: [{ rotate: "-15deg" }] }}
      >
        <Image
          source={require("@/assets/images/onboarding-bag.png")}
          className="size-[89px]"
          resizeMode="contain"
          style={{ transform: [{ rotate: "3.83deg" }] }}
        />
      </View>
      <View
        className="absolute left-1/2 top-[17px] size-[114px] items-center justify-center rounded-[11px] border border-gray-100 bg-[#EEEEEE]/40"
        style={{ marginLeft: 78, transform: [{ rotate: "15deg" }] }}
      >
        <Image
          source={require("@/assets/images/onboarding-lamp.png")}
          className="size-[104px]"
          resizeMode="contain"
          style={{ transform: [{ rotate: "-12.35deg" }] }}
        />
      </View>
      <View
        className="absolute left-1/2 size-[114px] items-center justify-center rounded-[8px] border border-gray-100 bg-[#EEEEEE]/40"
        style={{ marginLeft: -57 }}
      >
        <Image
          source={require("@/assets/images/onboarding-perfume.png")}
          className="size-[99px]"
          resizeMode="contain"
          style={{ transform: [{ rotate: "6.37deg" }] }}
        />
      </View>
    </View>
  );
}

export function OnboardingFinishScreen({ mode }: OnboardingFinishScreenProps) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isGuest = mode === "guest";

  return (
    <>
      <StatusBar style="dark" />
      <ScrollView
        className="flex-1 bg-gray-0"
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View className="relative bg-gray-0" style={{ minHeight: Math.max(height, 812) }}>
          <View
            className="absolute inset-x-0 gap-6 px-margin"
            style={{ top: Math.max(126, insets.top + 50) }}
          >
            <Text className="text-gray-1000 font-h1" style={{ includeFontPadding: false }}>
              {isGuest ? "마음껏 Diggin을\n둘러보세요." : "Diggin을 사용할\n준비가 완료되었어요."}
            </Text>
            <Text
              className="text-gray-600 font-label-16-medium"
              style={{ includeFontPadding: false }}
            >
              {isGuest ? "회원가입은 언제나 열려 있어요." : "하단 버튼을 눌러 시작해 볼까요?"}
            </Text>
          </View>

          <ProductArtwork />

          <View className="absolute inset-x-0 px-margin" style={{ bottom: 180 }}>
            <Button
              size="large"
              className="rounded-field"
              onPress={() => router.replace("/(tabs)/all")}
            >
              {isGuest ? "둘러보기" : "시작하기"}
            </Button>
          </View>
          {isGuest && (
            <Pressable
              className="absolute inset-x-0 h-12 items-center justify-center"
              style={{ bottom: 108 }}
              accessibilityRole="button"
              onPress={() => router.replace("/login")}
            >
              <Text className="text-gray-500 underline font-b3">회원가입 하기</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </>
  );
}
