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

/** MY-007 계정과 개인정보를 지운다. 세션은 서버에서 함께 사라지니 이 기기 로그아웃은 부른 쪽이 한다. */
export async function withdrawAccount({ reasons, detail }: WithdrawalSurvey) {
  const { error } = await supabase.functions.invoke("account-withdrawal", {
    body: {
      reasons: reasons.flatMap((reason) => REASON_CODES[reason] ?? []),
      custom_text: detail || null,
    },
  });
  if (!error) return;
  // 지운 뒤 응답만 끊겼을 수 있다. 다시 요청하면 인증부터 실패하니 계정이 남았는지로 가린다.
  const { error: userError } = await supabase.auth.getUser();
  if (userError?.code === "user_not_found") return;
  throw error;
}
