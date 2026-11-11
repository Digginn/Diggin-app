import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

import type { WithdrawalSurvey } from "../components/AccountWithdrawalSurvey";

type WithdrawalReason = Database["public"]["Enums"]["withdrawal_reason"];

// MY-006 설문 선택지 문구를 DB의 withdrawal_reason 값으로 바꾼다. 직접 작성은 custom_text로 보낸다.
const REASON_CODES: Record<string, WithdrawalReason> = {
  "자주 사용하지 않아요.": "rarely_used",
  "원하는 기능이 없어요.": "missing_feature",
  "다른 서비스를 이용해요.": "other_service",
  "사용이 어렵고 불편해요.": "hard_to_use",
  "오류가 자주 생겨요.": "frequent_error",
};

/** 애플 가입자는 탈퇴 직전에 다시 인증해 서버가 애플 연결을 해지할 코드를 받는다. 취소하면 null이다. */
async function readAppleCode() {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.identities?.some((identity) => identity.provider === "apple")) return undefined;
  if (Platform.OS !== "ios") throw new Error("apple_reauth_not_supported");
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    if (!credential.authorizationCode) throw new Error("apple_authorization_code_missing");
    return credential.authorizationCode;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ERR_REQUEST_CANCELED") {
      return null;
    }
    throw error;
  }
}

/** MY-007 계정과 개인정보를 지운다. 세션은 서버에서 함께 사라지니 이 기기 로그아웃은 부른 쪽이 한다. */
export async function withdrawAccount({ reasons, detail }: WithdrawalSurvey) {
  const appleCode = await readAppleCode();
  if (appleCode === null) return "cancelled";
  const { error } = await supabase.functions.invoke("account-withdrawal", {
    body: {
      reasons: reasons.flatMap((reason) => REASON_CODES[reason] ?? []),
      custom_text: detail || null,
      apple_authorization_code: appleCode,
    },
  });
  if (!error) return "withdrawn";
  // 지운 뒤 응답만 끊겼을 수 있다. 다시 요청하면 인증부터 실패하니 계정이 남았는지로 가린다.
  const { error: userError } = await supabase.auth.getUser();
  if (userError?.code === "user_not_found") return "withdrawn";
  throw error;
}
