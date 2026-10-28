import { readJson } from "../_shared/readJson.ts";

// MY-006 선택지 순서와 같다(public.withdrawal_reason).
const REASONS = new Set([
  "rarely_used",
  "missing_feature",
  "other_service",
  "hard_to_use",
  "frequent_error",
]);
const CUSTOM_TEXT_MAX = 100;
// 앱 화면과 DB(private.char_count)처럼 👍🏻 같은 조합 이모지를 1자로 센다. string.length는 UTF-16 단위라 4자로 센다.
const graphemes = new Intl.Segmenter("ko", { granularity: "grapheme" });

const APPLE_CODE_MAX = 1024;

type Survey = { reasons: string[]; customText: string | null };
type Services = {
  authenticate: (token: string) => Promise<string>;
  /** 애플 가입자면 애플 계정 ID(sub), 아니면 null */
  appleSubject: (userId: string) => Promise<string | null>;
  exchangeAppleCode: (code: string) => Promise<{ subject: string; refreshToken: string }>;
  revokeAppleToken: (refreshToken: string) => Promise<void>;
  removeAvatars: (userId: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  recordSurvey: (survey: Survey) => Promise<void>;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
}

function parseSurvey(value: unknown): Survey {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_request");
  }
  const { reasons, custom_text } = value as Record<string, unknown>;
  if (
    !Array.isArray(reasons) || reasons.some((reason) => !REASONS.has(reason)) ||
    new Set(reasons).size !== reasons.length
  ) {
    throw new Error("invalid_request");
  }
  if (custom_text != null && typeof custom_text !== "string") throw new Error("invalid_request");
  // 자모가 나뉜 한글(NFD)은 DB가 자모마다 1자로 세서, 합친 형태로 세고 저장한다.
  const customText = custom_text?.normalize("NFC").trim() || null;
  const length = customText ? [...graphemes.segment(customText)].length : 0;
  if (length > CUSTOM_TEXT_MAX || (!reasons.length && !customText)) {
    throw new Error("invalid_request");
  }
  return { reasons, customText };
}

function parseAppleCode(value: unknown) {
  const code = (value as Record<string, unknown>).apple_authorization_code;
  if (code == null) return null;
  if (typeof code !== "string" || !code || code.length > APPLE_CODE_MAX) {
    throw new Error("invalid_request");
  }
  return code;
}

/**
 * MY-007 본인 계정을 지운다. 사용자는 JWT에서만 가져온다.
 * 프로필 사진을 먼저 지워 계정 삭제가 실패해도 개인정보가 남지 않게 하고,
 * 설문은 계정이 지워진 뒤에 남겨 재시도로 중복되지 않게 한다.
 * 애플 가입자는 탈퇴 직전 재인증한 코드로 애플 토큰을 해지한 뒤에만 지운다(Apple 계정 삭제 가이드).
 * 해지 없이 계정을 지우면 다시 해지할 방법이 없어 실패로 돌리고, 재시도는 새 코드로 다시 해지한다.
 */
export function createWithdrawalHandler(services: Services) {
  return async (request: Request) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let userId: string;
    try {
      const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) return json({ error: "not_authenticated" }, 401);
      userId = await services.authenticate(token);
    } catch {
      return json({ error: "not_authenticated" }, 401);
    }
    let survey: Survey;
    let appleCode: string | null;
    try {
      if (!request.headers.get("content-type")?.startsWith("application/json")) {
        throw new Error("invalid_request");
      }
      const body = await readJson(request);
      survey = parseSurvey(body);
      appleCode = parseAppleCode(body);
    } catch (error) {
      const isTooLarge = error instanceof Error && error.message === "request_too_large";
      return json(
        { error: isTooLarge ? "request_too_large" : "invalid_request" },
        isTooLarge ? 413 : 400,
      );
    }
    try {
      const appleSubject = await services.appleSubject(userId);
      if (appleSubject) {
        if (!appleCode) return json({ error: "apple_reauth_required" }, 400);
        const apple = await services.exchangeAppleCode(appleCode);
        // 다른 애플 계정으로 재인증하면 가입한 계정의 연결이 남는다.
        if (apple.subject !== appleSubject) return json({ error: "apple_account_mismatch" }, 403);
        await services.revokeAppleToken(apple.refreshToken);
      }
    } catch {
      return json({ error: "apple_revoke_failed" }, 503);
    }
    try {
      await services.removeAvatars(userId);
      await services.deleteUser(userId);
    } catch {
      return json({ error: "withdrawal_failed" }, 503);
    }
    try {
      await services.recordSurvey(survey);
    } catch {
      // 계정은 이미 지워졌다. 설문 하나 때문에 탈퇴를 실패로 돌리지 않는다.
      console.warn("withdrawal_survey_failed");
    }
    return json({ withdrawn: true });
  };
}
