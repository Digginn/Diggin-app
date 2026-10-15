import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

import type { LoginProvider } from "../components/SocialLoginButton";

export type SignInResult = { status: "cancelled" } | { status: "success"; isNewUser: boolean };

const NEW_USER_WINDOW_MS = 60_000;

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

// Supabase는 신규 가입 여부를 따로 알려주지 않는다. 첫 로그인은 가입 시각과 마지막 로그인 시각이 같다.
// shortcut: 시각 차이로 판단한다. 서버에 가입 완료 안내 노출 여부를 저장하게 되면 그 값으로 바꾼다.
async function finishSignIn(): Promise<SignInResult> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const createdAt = Date.parse(data.user.created_at);
  const lastSignInAt = Date.parse(data.user.last_sign_in_at ?? data.user.created_at);
  return { status: "success", isNewUser: lastSignInAt - createdAt < NEW_USER_WINDOW_MS };
}

// MY-010 최소 수집: 닉네임은 랜덤으로 만들어 이름·이메일을 요청하지 않는다.
async function signInWithAppleNative(): Promise<SignInResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    if (!credential.identityToken) throw new Error("apple_identity_token_missing");
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error) throw error;
    return finishSignIn();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ERR_REQUEST_CANCELED") {
      return { status: "cancelled" };
    }
    throw error;
  }
}

async function signInWithGoogle(): Promise<SignInResult> {
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return { status: "cancelled" };
    if (!response.data.idToken) throw new Error("google_id_token_missing");
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: response.data.idToken,
    });
    if (error) throw error;
    return finishSignIn();
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) {
      return { status: "cancelled" };
    }
    throw error;
  }
}

// 카카오, 그리고 기기 애플 로그인이 없는 Android의 애플은 브라우저 로그인 후 딥링크로 돌아온다.
async function signInWithBrowser(provider: "kakao" | "apple"): Promise<SignInResult> {
  const redirectTo = Linking.createURL("auth/callback");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return { status: "cancelled" };

  const { queryParams } = Linking.parse(result.url);
  if (typeof queryParams?.error_description === "string") {
    throw new Error(queryParams.error_description);
  }
  if (typeof queryParams?.code !== "string") throw new Error("oauth_code_missing");

  const exchanged = await supabase.auth.exchangeCodeForSession(queryParams.code);
  if (exchanged.error) throw exchanged.error;
  return finishSignIn();
}

export function signIn(provider: LoginProvider): Promise<SignInResult> {
  if (provider === "google") return signInWithGoogle();
  if (provider === "apple" && Platform.OS === "ios") return signInWithAppleNative();
  return signInWithBrowser(provider);
}
