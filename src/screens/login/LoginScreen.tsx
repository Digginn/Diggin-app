import { Redirect, useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SANCTION_REASON_LABELS, type AccountAccess } from "@/api/accountAccess";
import BackIcon from "@/assets/images/icon-login-back.svg";
import DigginLogo from "@/assets/images/icon-login-diggin.svg";
import { AppBar } from "@/components/app-bar";
import { LoadingDialog } from "@/components/LoadingDialog";
import { ToastText } from "@/components/ToastText";
import { useAuth } from "@/contexts/AuthContext";
import { discardShareLink } from "@/lib/pendingShareLink";
import { SanctionNoticeModal } from "@/screens/diggle/components/SanctionNoticeModal";

import { signIn } from "./api/signIn";
import { SocialLoginButton, type LoginProvider } from "./components/SocialLoginButton";

const LOGIN_PROVIDERS: LoginProvider[] =
  Platform.OS === "ios" ? ["google", "kakao", "apple"] : ["google", "kakao"];

type LoginScreenProps = {
  isLoginError?: boolean;
  isLoginLoading?: boolean;
  /** 실제 로그인 경로에서만 켠다. 미리보기 화면은 로그인한 개발자에게도 보여야 한다. */
  isRedirectedWhenSignedIn?: boolean;
};

export function LoginScreen({
  isLoginError = false,
  isLoginLoading = false,
  isRedirectedWhenSignedIn = false,
}: LoginScreenProps = {}) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [hasError, setHasError] = useState(isLoginError);
  const [isLoading, setIsLoading] = useState(isLoginLoading);
  const [suspension, setSuspension] = useState<AccountAccess | null>(null);
  const hasSignedIn = useRef(false);
  const [didSignIn, setDidSignIn] = useState(false);
  const { session } = useAuth();
  const shouldRedirect = isRedirectedWhenSignedIn && !!session && !isLoading && !didSignIn;

  // 복원된 세션으로 자동 이동할 때도 ALL이 공유 링크를 이어 받아야 한다.
  useEffect(() => {
    if (shouldRedirect) hasSignedIn.current = true;
  }, [shouldRedirect]);

  // AUTH-001 공유하러 왔다가 로그인하지 않고 나가면 맡긴 링크를 버린다. 로그인 실패는 다시 시도할 수 있게 둔다.
  useEffect(
    () => () => {
      if (!hasSignedIn.current) discardShareLink();
    },
    [],
  );

  async function handleLogin(provider: LoginProvider) {
    if (isLoading) return;
    setHasError(false);
    setIsLoading(true);
    try {
      const result = await signIn(provider);
      if (result.status === "cancelled") return;
      if (result.status === "suspended") {
        setSuspension(result.access);
        return;
      }
      hasSignedIn.current = true;
      setDidSignIn(true);
      // ONB-004 가입 완료 안내는 신규 회원에게만 보여준다.
      router.replace((result.isNewUser ? "/signup-complete" : "/(tabs)/all") as Href);
    } catch {
      console.warn("소셜 로그인에 실패했습니다.");
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }

  function handlePolicy(title: string) {
    Alert.alert(title, "안내 페이지가 준비되면 연결할 예정입니다.");
  }

  // 이미 로그인한 사람이 diggin://login 으로 들어오면 로그인 화면이 필요 없다.
  // 로그인 중에도 세션이 먼저 생겨, 로그인 중이거나 막 끝났을 때는 아래 이동(가입 완료 안내 등)에 맡긴다.
  if (shouldRedirect) {
    return <Redirect href={"/(tabs)/all" as Href} />;
  }

  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <AppBar
        left={hasError ? "none" : "back"}
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
            {"여러 쇼핑 플랫폼에서 따로 찜해뒀던 아이템들,\n찾기 쉽게 한 곳에서 관리하세요."}
          </Text>
        </View>
        <View className="mt-[60px] w-full gap-[10px] px-margin">
          {hasError && (
            <View
              pointerEvents="none"
              className="absolute inset-x-0 top-[-54px] items-center px-margin"
            >
              <ToastText message="로그인에 실패했습니다. 다시 시도해 주세요." />
            </View>
          )}
          {LOGIN_PROVIDERS.map((provider) => (
            <SocialLoginButton
              key={provider}
              provider={provider}
              onPress={() => handleLogin(provider)}
            />
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
      {isLoading && <LoadingDialog message="로그인 중입니다." />}
      {suspension && (
        <SanctionNoticeModal
          visible
          notice={{
            type: "suspended",
            reasonLabel: suspension.reasonCategory
              ? SANCTION_REASON_LABELS[suspension.reasonCategory]
              : "1:1 문의로 확인해 주세요.",
          }}
          onConfirm={() => setSuspension(null)}
        />
      )}
    </View>
  );
}
