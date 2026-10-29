import { Redirect, useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SANCTION_REASON_LABELS, type AccountAccess } from "@/api/accountAccess";
import CheckboxOff from "@/assets/images/icon-checkbox-off.svg";
import CheckboxOn from "@/assets/images/icon-checkbox-on.svg";
import BackIcon from "@/assets/images/icon-login-back.svg";
import DigginLogo from "@/assets/images/icon-login-diggin.svg";
import { AppBar } from "@/components/app-bar";
import { LoadingDialog } from "@/components/LoadingDialog";
import { ActionModal } from "@/components/modal";
import { ToastText } from "@/components/ToastText";
import { UnderageNoticeModal } from "@/components/UnderageNoticeModal";
import { useAuth } from "@/contexts/AuthContext";
import { keepLoginIntent, takeLoginIntent } from "@/lib/loginIntent";
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
  const [isAgeConsented, setIsAgeConsented] = useState(false);
  const [isConsentNoticeOpen, setIsConsentNoticeOpen] = useState(false);
  const hasSignedIn = useRef(false);
  const isSigningIn = useRef(false);
  const [didSignIn, setDidSignIn] = useState(false);
  const { session } = useAuth();
  const shouldRedirect = isRedirectedWhenSignedIn && !!session && !isLoading && !didSignIn;

  // 복원된 세션으로 자동 이동할 때도 ALL이 공유 링크를 이어 받아야 한다.
  useEffect(() => {
    if (shouldRedirect) hasSignedIn.current = true;
  }, [shouldRedirect]);

  // AUTH-001 로그인하지 않고 나가면 이어 할 동작과 맡긴 공유 링크를 버린다.
  useEffect(
    () => () => {
      if (!hasSignedIn.current) {
        takeLoginIntent();
        discardShareLink();
      }
    },
    [],
  );

  async function handleLogin(provider: LoginProvider) {
    if (isSigningIn.current) return;
    if (!isAgeConsented) {
      setIsConsentNoticeOpen(true);
      return;
    }
    isSigningIn.current = true;
    setHasError(false);
    try {
      // iOS는 화면이 떠오르는 중에 다른 화면을 띄우지 않는다. 로딩 창을 먼저 띄우면 로그인 창이 안 열린다.
      const result = await signIn(provider, () => setIsLoading(true));
      if (result.status === "cancelled") return;
      if (result.status === "suspended") {
        setSuspension(result.access);
        return;
      }
      hasSignedIn.current = true;
      setDidSignIn(true);
      const resume = takeLoginIntent();
      // ONB-004 가입 완료 안내는 신규 회원에게만 보여준다. 이어 할 동작은 안내를 지난 뒤에 한다.
      if (result.isNewUser) {
        if (resume) keepLoginIntent(resume);
        router.replace("/signup-complete" as Href);
        return;
      }
      if (resume && router.canGoBack()) {
        router.back();
        resume();
        return;
      }
      router.replace("/(tabs)/all" as Href);
    } catch {
      console.warn("소셜 로그인에 실패했습니다.");
      setHasError(true);
    } finally {
      isSigningIn.current = false;
      setIsLoading(false);
    }
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
        {/* Figma AgeConsentRow는 화면 왼쪽 1.5, 오른쪽 46.5 여백 안에서 가운데 정렬돼 있다. */}
        <View className="mt-4 w-full flex-row items-center justify-center pl-[1.5px] pr-[46.5px]">
          <Pressable
            onPress={() => setIsAgeConsented((checked) => !checked)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isAgeConsented }}
            accessibilityLabel="(필수) 만 14세 이상이며 이용약관 및 개인정보 처리방침에 동의합니다."
            className="size-12 items-center justify-center"
          >
            {isAgeConsented ? <CheckboxOn /> : <CheckboxOff />}
          </Pressable>
          <Text className="text-center text-[#333333] font-meta">
            {"(필수) 만 14세 이상이며\n"}
            <Text accessibilityRole="link" onPress={() => router.push("/policies/terms")}>
              이용약관
            </Text>
            {" 및 "}
            <Text accessibilityRole="link" onPress={() => router.push("/policies/privacy")}>
              개인정보 처리방침
            </Text>
            에 동의합니다.
          </Text>
        </View>
        <Pressable
          onPress={() => router.replace("/browse")}
          accessibilityRole="button"
          className="mt-1 h-12 min-w-12 items-center justify-center"
        >
          <Text className="text-gray-500 underline font-b3">회원가입 없이 둘러보기</Text>
        </Pressable>
      </ScrollView>
      {isLoading && <LoadingDialog message="로그인 중입니다." />}
      <ActionModal
        visible={isConsentNoticeOpen}
        title="약관 동의가 필요합니다."
        description="필수 항목에 동의한 후 다시 로그인해 주세요."
        isPrimaryDisabled={false}
        onRequestClose={() => setIsConsentNoticeOpen(false)}
        primaryAction={{ label: "확인", onPress: () => setIsConsentNoticeOpen(false) }}
      />
      {suspension &&
        (suspension.reasonCategory === "underage" ? (
          <UnderageNoticeModal onConfirm={() => setSuspension(null)} />
        ) : (
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
        ))}
    </View>
  );
}
