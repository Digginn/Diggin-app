import { Redirect, useFocusEffect, useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SANCTION_REASON_LABELS, type AccountAccess } from "@/api/accountAccess";
import BackIcon from "@/assets/images/icon-login-back.svg";
import DigginLogo from "@/assets/images/icon-login-diggin.svg";
import { AppBar } from "@/components/app-bar";
import { LoadingDialog } from "@/components/LoadingDialog";
import { ToastText } from "@/components/ToastText";
import { UnderageNoticeModal } from "@/components/UnderageNoticeModal";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { keepLoginIntent, takeLoginIntent } from "@/lib/loginIntent";
import { discardShareLink } from "@/lib/pendingShareLink";
import { SanctionNoticeModal } from "@/screens/diggle/components/SanctionNoticeModal";

import { saveLoginAnalyticsConsent } from "./api/loginConsent";
import { signIn } from "./api/signIn";
import { SocialLoginButton, type LoginProvider } from "./components/SocialLoginButton";
import {
  EMPTY_TERMS_CONSENT,
  TermsConsentSheet,
  type TermsConsent,
} from "./components/TermsConsentSheet";

// 확인 직후에는 아직 로그인이 아니라 제공자의 계정 선택 화면으로 넘어가는 중이다.
const PROVIDER_NAMES: Record<LoginProvider, string> = {
  google: "Google",
  kakao: "Kakao",
  apple: "Apple",
};

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
  const [consent, setConsent] = useState<TermsConsent>(EMPTY_TERMS_CONSENT);
  const [isConsentSheetOpen, setIsConsentSheetOpen] = useState(false);
  // 시트를 띄운 제공자. 확인하면 시트가 사라진 뒤 바로 이 제공자로 로그인한다.
  const [pendingProvider, setPendingProvider] = useState<LoginProvider | null>(null);
  // 확인부터 로그인 창이 뜨기 전까지 멈춘 것처럼 보이지 않게 시트 위에 로그인 중 표시를 띄운다.
  const [isStartingLogin, setIsStartingLogin] = useState(false);
  // 약관 전문을 보고 돌아오면 체크한 그대로 시트를 다시 연다.
  const isReturningToSheet = useRef(false);
  // BUG-145 전문을 보러 가고 돌아오는 동안은 시트를 움직이지 않고 그 자리에 둔다.
  const [isSheetStill, setIsSheetStill] = useState(false);
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

  useFocusEffect(
    useCallback(() => {
      if (!isReturningToSheet.current) return;
      isReturningToSheet.current = false;
      setIsConsentSheetOpen(true);
      // 제자리로 다시 띄운 다음 프레임부터는 닫을 때 평소처럼 내려간다.
      const frame = requestAnimationFrame(() => setIsSheetStill(false));
      return () => cancelAnimationFrame(frame);
    }, []),
  );

  // AUTH-02 소셜 로그인 버튼을 누르면 이용약관 동의 시트를 먼저 띄운다.
  function openConsentSheet(provider: LoginProvider) {
    if (isSigningIn.current) return;
    setPendingProvider(provider);
    setIsConsentSheetOpen(true);
  }

  /**
   * 확인하면 다시 버튼을 누르지 않아도 고른 소셜 로그인을 바로 시작한다.
   * iOS는 닫히는 중인 시트 위에 로그인 창을 띄우지 않아, 시트를 연 채로 그 위에 띄우고 인증이 끝나면 닫는다.
   * 로그인을 취소하면 체크한 그대로 시트가 남아 다시 확인하거나 닫을 수 있다.
   */
  function confirmConsent() {
    if (!pendingProvider || isSigningIn.current) return;
    setIsStartingLogin(true);
    return handleLogin(pendingProvider, consent).finally(() => setIsStartingLogin(false));
  }

  async function handleLogin(provider: LoginProvider, agreed: TermsConsent) {
    if (isSigningIn.current) return;
    isSigningIn.current = true;
    setHasError(false);
    try {
      // iOS는 화면이 떠오르는 중에 다른 화면을 띄우지 않는다. 로딩 창을 먼저 띄우면 로그인 창이 안 열린다.
      const result = await signIn(provider, () => {
        setIsConsentSheetOpen(false);
        setIsLoading(true);
      });
      if (result.status === "cancelled") return;
      setIsConsentSheetOpen(false);
      if (result.status === "suspended") {
        setSuspension(result.access);
        return;
      }
      hasSignedIn.current = true;
      setDidSignIn(true);
      // 가입 완료 이벤트가 동의 여부에 따라 전송되도록 선택 동의를 먼저 저장한다. 실패해도 로그인은 이어 간다.
      await saveLoginAnalyticsConsent(result.isNewUser, {
        usage_analysis: agreed.usageAnalysis,
        overseas_transfer: agreed.overseasTransfer,
      }).catch(() => console.warn("선택 동의를 저장하지 못했습니다."));
      const resume = takeLoginIntent();
      // ONB-004 가입 완료 안내는 신규 회원에게만 보여준다. 이어 할 동작은 안내를 지난 뒤에 한다.
      if (result.isNewUser) {
        trackEvent("signup_complete", { signup_method: provider });
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
      setIsConsentSheetOpen(false);
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
              onPress={() => openConsentSheet(provider)}
            />
          ))}
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
      <TermsConsentSheet
        visible={isConsentSheetOpen}
        consent={consent}
        onChange={setConsent}
        isAnimated={!isSheetStill}
        onOpenDocument={(document) => {
          isReturningToSheet.current = true;
          setIsSheetStill(true);
          setIsConsentSheetOpen(false);
          router.push(`/policies/${document}` as Href);
        }}
        onConfirm={confirmConsent}
        onClose={() => setIsConsentSheetOpen(false)}
        loadingMessage={
          isStartingLogin && pendingProvider
            ? `${PROVIDER_NAMES[pendingProvider]} 로그인으로 이동 중입니다.`
            : undefined
        }
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
