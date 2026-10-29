import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GoogleSignin,
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
import { supabase } from "@/lib/supabase";

import type { LoginProvider } from "../components/SocialLoginButton";

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
  onAuthorized: () => void,
): Promise<SignInResult> {
  onAuthorized();
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
  return finishSignIn();
}

const NEW_USER_WINDOW_MS = 60_000;
const SIGNUP_COMPLETE_SHOWN_KEY = "signup-complete-shown";

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

const kakaoNativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
if (kakaoNativeAppKey) void initializeKakaoSDK(kakaoNativeAppKey);

// Supabase는 신규 가입 여부를 따로 알려주지 않는다. 첫 로그인은 가입 시각과 마지막 로그인 시각이 같다.
// 가입 1분 안에 다시 로그인해도 가입 완료 안내는 이 기기에서 한 번만 보여 준다.
// shortcut: 시각 차이와 기기 기록으로 판단한다. 서버에 가입 완료 안내 노출 여부를 저장하게 되면 그 값으로 바꾼다.
async function finishSignIn(): Promise<SignInResult> {
  const access = await fetchAccountAccess();
  if (access.status === "suspended") {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "suspended", access };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const createdAt = Date.parse(data.user.created_at);
  const lastSignInAt = Date.parse(data.user.last_sign_in_at ?? data.user.created_at);
  if (lastSignInAt - createdAt >= NEW_USER_WINDOW_MS)
    return { status: "success", isNewUser: false };

  const shownKey = `${SIGNUP_COMPLETE_SHOWN_KEY}:${data.user.id}`;
  try {
    if (await AsyncStorage.getItem(shownKey)) return { status: "success", isNewUser: false };
    await AsyncStorage.setItem(shownKey, "1");
  } catch {
    // 기록을 못 읽어도 로그인은 이어 간다. 안내가 한 번 더 뜨는 편이 막히는 것보다 낫다.
  }
  return { status: "success", isNewUser: true };
}

// MY-010 최소 수집: 닉네임은 랜덤으로 만들어 이름·이메일을 요청하지 않는다.
async function signInWithAppleNative(onAuthorized: () => void): Promise<SignInResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    if (!credential.identityToken) throw new Error("apple_identity_token_missing");
    const result = await signInWithIdentity("apple", credential.identityToken, onAuthorized);
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

async function signInWithGoogle(onAuthorized: () => void): Promise<SignInResult> {
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return { status: "cancelled" };
    if (!response.data.idToken) throw new Error("google_id_token_missing");
    return signInWithIdentity("google", response.data.idToken, onAuthorized);
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
async function signInWithKakao(onAuthorized: () => void): Promise<SignInResult> {
  try {
    const token = await loginWithKakao();
    // 카카오 콘솔에서 OpenID Connect를 켜야 idToken이 온다.
    if (!token.idToken) throw new Error("kakao_id_token_missing");
    const result = await signInWithIdentity("kakao", token.idToken, onAuthorized);
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
): Promise<SignInResult> {
  if (provider === "google") return signInWithGoogle(onAuthorized);
  if (provider === "kakao") return signInWithKakao(onAuthorized);
  if (Platform.OS !== "ios") return Promise.reject(new Error("apple_login_not_supported"));
  return signInWithAppleNative(onAuthorized);
}
