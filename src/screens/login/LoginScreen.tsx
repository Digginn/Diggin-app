import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Alert, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BackIcon from "@/assets/images/icon-login-back.svg";
import DigginLogo from "@/assets/images/icon-login-diggin.svg";
import { AppBar } from "@/components/app-bar";
import { LoadingDialog } from "@/components/LoadingDialog";
import { ToastText } from "@/components/ToastText";

import { SocialLoginButton, type LoginProvider } from "./components/SocialLoginButton";

const LOGIN_PROVIDERS: LoginProvider[] = ["google", "kakao", "apple"];

type LoginScreenProps = {
  isLoginError?: boolean;
  isLoginLoading?: boolean;
};

export function LoginScreen({
  isLoginError = false,
  isLoginLoading = false,
}: LoginScreenProps = {}) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  function handleLogin() {
    Alert.alert(
      "로그인 연동 준비 중",
      "현재는 UI 확인용 화면입니다. 실제 로그인은 아직 연결되지 않았습니다.",
    );
  }

  function handlePolicy(title: string) {
    Alert.alert(title, "안내 페이지가 준비되면 연결할 예정입니다.");
  }

  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <AppBar
        left={isLoginError ? "none" : "back"}
        backIcon={BackIcon}
        backIconSize={24}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="items-center"
        contentContainerStyle={{
          minHeight: height - insets.top - 56,
          paddingBottom: Math.max(36, insets.bottom),
        }}
      >
        <View className="mt-[43px]" accessible={false}>
          <DigginLogo />
        </View>
        <View className="mt-9 w-full gap-5">
          <Text
            className="px-14 text-center text-gray-1000 font-h1"
            style={{ includeFontPadding: false }}
          >
            {"흩어진 취향을 한번에\n고민도 쇼핑의 일부니까"}
          </Text>
          <Text
            className="px-margin text-center text-gray-500 font-b2"
            style={{ includeFontPadding: false }}
          >
            {"여러 쇼핑 플랫폼에서 따로 찜해뒀던 상품들,\n찾기 쉽게 한 곳에서 관리하세요."}
          </Text>
        </View>
        <View className="mt-[60px] w-full gap-[10px] px-margin">
          {isLoginError && (
            <View
              pointerEvents="none"
              className="absolute inset-x-0 top-[-54px] items-center px-margin"
            >
              <ToastText message="로그인에 실패했습니다. 다시 시도해 주세요." />
            </View>
          )}
          {LOGIN_PROVIDERS.map((provider) => (
            <SocialLoginButton key={provider} provider={provider} onPress={handleLogin} />
          ))}
        </View>
        <Pressable
          onPress={() => router.replace("/browse")}
          accessibilityRole="button"
          className="mt-6 h-12 min-w-12 items-center justify-center"
        >
          <Text className="text-gray-500 underline font-b3">회원가입 없이 둘러보기</Text>
        </Pressable>
        <View className="mt-6 w-full flex-1 flex-row flex-wrap items-end justify-center gap-x-1">
          <View className="h-12 justify-center">
            <Text className="text-gray-500 font-meta">로그인 시</Text>
          </View>
          <Pressable
            onPress={() => handlePolicy("이용약관")}
            accessibilityRole="button"
            className="h-12 min-w-12 items-center justify-center"
          >
            <Text className="text-gray-700 underline font-meta">이용약관</Text>
          </Pressable>
          <View className="h-12 justify-center">
            <Text className="text-gray-500 font-meta">및</Text>
          </View>
          <View className="h-12 flex-row items-center">
            <Pressable
              onPress={() => handlePolicy("개인정보 처리방침")}
              accessibilityRole="button"
              className="h-12 min-w-12 items-center justify-center"
            >
              <Text className="text-gray-700 underline font-meta">개인정보 처리방침</Text>
            </Pressable>
            <Text className="text-gray-500 font-meta">에 동의하게 됩니다.</Text>
          </View>
        </View>
      </ScrollView>
      {isLoginLoading && (
        <LoadingDialog message="로그인 중입니다." onRequestClose={() => router.replace("/login")} />
      )}
    </View>
  );
}
