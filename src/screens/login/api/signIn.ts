import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { initializeKakaoSDK } from "@react-native-kakao/core";
import { me as getKakaoProfile, login as loginWithKakao } from "@react-native-kakao/user";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";

import { fetchAccountAccess, parseAccountAccess, type AccountAccess } from "@/api/accountAccess";
import { saveAvatar } from "@/api/avatar";
import { GoogleSignin } from "@/lib/googleSignIn";
import { supabase } from "@/lib/supabase";

import type { LoginProvider } from "../components/SocialLoginButton";
import type { TermsConsent } from "../components/TermsConsentSheet";

// 앱에 포함된 약관 전문의 버전. 재동의 대상 버전이 다르면 구버전 문서로 동의시키지 않는다.
const LOGIN_POLICY_VERSION = "1.1";
type LoginFlow = {
  onAuthorized: () => void;
  requestConsent: () => Promise<TermsConsent | null>;
  rollbackSession: () => Promise<void>;
};

export type SignInResult =
  | { status: "cancelled" }
  | { status: "success"; isNewUser: boolean }
  | { status: "suspended"; access: AccountAccess };

const UNKNOWN_SUSPENSION: AccountAccess = {
  status: "suspended",
  restrictedUntil: null,
  sanctionId: null,
  reasonCategory: null,
  noticeSeenAt: null,
};
function isBanned(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "user_banned";
}
async function signInWithIdentity(
  provider: "google" | "kakao" | "apple",
  token: string,
  flow: LoginFlow,
): Promise<SignInResult> {
  flow.onAuthorized();
  // 아직 Supabase 인증·가입은 하지 않는다. 서버가 제공자 토큰의 서명과 대상 앱을 검증한다.
  const lookup = await supabase.functions.invoke("account-restriction", {
    body: { provider, id_token: token, operation: "login-consent" },
  });
  if (lookup.error) throw lookup.error;
  if (lookup.data?.notice)
    return { status: "suspended", access: parseAccountAccess(lookup.data.notice) };
  const policies = lookup.data?.policy_status;
  if (
    typeof policies?.requires_consent !== "boolean" ||
    typeof policies.is_new_user !== "boolean" ||
    !Number.isSafeInteger(policies.terms_policy_id) ||
    policies.terms_policy_id <= 0 ||
    !Number.isSafeInteger(policies.privacy_policy_id) ||
    policies.privacy_policy_id <= 0
  )
    throw new Error("invalid_login_policy_status");
  let agreed: TermsConsent | null = null;
  if (policies.requires_consent) {
    if (
      policies.terms_version !== LOGIN_POLICY_VERSION ||
      policies.privacy_version !== LOGIN_POLICY_VERSION
    )
      throw new Error("login_policy_update_required");
    agreed = await flow.requestConsent();
    if (!agreed) return { status: "cancelled" };
    if (!agreed.age || !agreed.terms || !agreed.privacy) throw new Error("login_consent_required");
  }
  const { error } = await supabase.auth.signInWithIdToken({ provider, token });
  if (error) {
    if (!isBanned(error)) throw error;
    const result = await supabase.functions.invoke("account-restriction", {
      body: { provider, id_token: token },
    });
    if (result.error || !result.data?.notice)
      return { status: "suspended", access: UNKNOWN_SUSPENSION };
    return { status: "suspended", access: parseAccountAccess(result.data.notice) };
  }
  try {
    const saved = await supabase.rpc("complete_login_consent", {
      terms_policy_id: policies.terms_policy_id,
      privacy_policy_id: policies.privacy_policy_id,
      age_confirmed: agreed?.age === true,
    });
    if (saved.error) throw saved.error;
  } catch (error) {
    // 버전 변경·저장 실패 시 중간 세션으로 로그인 완료 화면에 진입하지 않는다.
    await flow.rollbackSession();
    throw error;
  }
  return finishSignIn(policies.is_new_user);
}

const SIGNUP_COMPLETE_SHOWN_KEY = "signup-complete-shown";

const kakaoNativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
if (kakaoNativeAppKey) void initializeKakaoSDK(kakaoNativeAppKey);

// 최초 가입 안내는 서버에서 한 번만 선점한다. 재설치·다른 기기의 로그인도 재노출하지 않는다.
async function finishSignIn(isNewIdentity: boolean): Promise<SignInResult> {
  const access = await fetchAccountAccess();
  if (access.status === "suspended") {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "suspended", access };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const shownKey = `${SIGNUP_COMPLETE_SHOWN_KEY}:${data.user.id}`;
  let wasShown = false;
  try {
    wasShown = !!(await AsyncStorage.getItem(shownKey));
  } catch {
    // 기기 기록은 이전 버전 안내와의 호환용이다. 서버 기록을 기준으로 판단한다.
  }
  const completion = await Promise.resolve(supabase.rpc("claim_signup_completion")).catch(() => ({
    data: null,
    error: new Error("signup_completion_unavailable"),
  }));
  if (completion.error) {
    // 서버 미배포·조회 실패를 신규 가입으로 추측하지 않고 로그인은 계속한다.
    console.warn("가입 완료 안내 상태를 확인하지 못했습니다.");
    return { status: "success", isNewUser: false };
  }
  if (completion.data !== true || wasShown || !isNewIdentity)
    return { status: "success", isNewUser: false };
  try {
    await AsyncStorage.setItem(shownKey, "1");
  } catch {
    // 서버 선점은 완료됐으므로 기기 저장 실패가 재노출로 이어지지 않는다.
  }
  return { status: "success", isNewUser: true };
}

// MY-010 최소 수집: 닉네임은 랜덤으로 만들어 이름·이메일을 요청하지 않는다.
async function signInWithAppleNative(flow: LoginFlow): Promise<SignInResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    if (!credential.identityToken) throw new Error("apple_identity_token_missing");
    const result = await signInWithIdentity("apple", credential.identityToken, flow);
    // 자동 삭제 때 재인증 없이 애플 연결을 끊으려고 맡긴다. 실패해도 로그인은 이어 간다.
    if (result.status === "success" && credential.authorizationCode)
      void supabase.functions
        .invoke("apple-token", { body: { authorization_code: credential.authorizationCode } })
        .catch(() => {});
    return result;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ERR_REQUEST_CANCELED") {
      return { status: "cancelled" };
    }
    throw error;
  }
}

async function signInWithGoogle(flow: LoginFlow): Promise<SignInResult> {
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return { status: "cancelled" };
    if (!response.data.idToken) throw new Error("google_id_token_missing");
    return signInWithIdentity("google", response.data.idToken, flow);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) {
      return { status: "cancelled" };
    }
    throw error;
  }
}

// AUTH-006 카카오 프로필 사진을 우리 Storage에 복사해 둔다. 없거나 실패하면 기본 이미지로 둔다.
// shortcut: SDK가 카카오 기본 이미지 여부(is_default_image)를 주지 않아 기본 이미지도 복사된다. 구분이 필요하면 카카오 REST API로 확인한다.
async function importKakaoAvatar() {
  try {
    const { profileImageUrl } = await getKakaoProfile();
    if (profileImageUrl) await saveAvatar(profileImageUrl);
  } catch (error) {
    console.warn("카카오 프로필 사진을 가져오지 못했습니다.", error);
  }
}

// AUTH-004 카카오 SDK로 로그인한다. 카카오톡이 있으면 카카오톡으로, 없으면 카카오 계정 화면으로 연다.
// Supabase 브라우저 로그인은 이메일 동의항목을 항상 요청해 비즈 앱이 아니면 KOE205로 막힌다.
// ID 토큰 방식은 요청 항목을 카카오 동의항목 설정대로 받는다(MY-010 이메일 미수집).
async function signInWithKakao(flow: LoginFlow): Promise<SignInResult> {
  try {
    const token = await loginWithKakao();
    // 카카오 콘솔에서 OpenID Connect를 켜야 idToken이 온다.
    if (!token.idToken) throw new Error("kakao_id_token_missing");
    const result = await signInWithIdentity("kakao", token.idToken, flow);
    if (result.status === "success" && result.isNewUser) await importKakaoAvatar();
    return result;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "Cancelled") {
      return { status: "cancelled" };
    }
    throw error;
  }
}

// onAuthorized는 소셜 로그인 창이 닫히고 토큰을 받은 뒤 서버 처리 직전에 불린다.
export function signIn(
  provider: LoginProvider,
  onAuthorized: () => void = () => {},
  requestConsent: () => Promise<TermsConsent | null> = async () => null,
  rollbackSession: () => Promise<void> = async () => {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  },
): Promise<SignInResult> {
  const flow = { onAuthorized, requestConsent, rollbackSession };
  if (provider === "google") return signInWithGoogle(flow);
  if (provider === "kakao") return signInWithKakao(flow);
  if (Platform.OS !== "ios") return Promise.reject(new Error("apple_login_not_supported"));
  return signInWithAppleNative(flow);
}
