import { readJson } from "../_shared/readJson.ts";

const APPLE_CODE_MAX = 1024;

type Services = {
  authenticate: (token: string) => Promise<string>;
  appleSubject: (userId: string) => Promise<string | null>;
  exchangeAppleCode: (code: string) => Promise<{ subject: string; refreshToken: string }>;
  storeRefreshToken: (userId: string, refreshToken: string) => Promise<void>;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
}

/**
 * 애플 로그인 직후 받은 일회용 인증 코드를 refresh token으로 바꿔 보관한다(#164).
 * 만 14세 미만 계정 자동 삭제처럼 사용자가 재인증할 수 없을 때 이 토큰으로 애플 연결을 끊는다.
 * 사용자는 JWT에서만 가져오고, 다른 애플 계정의 코드는 저장하지 않는다.
 */
export function createAppleTokenHandler(services: Services) {
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
    let code: unknown;
    try {
      if (!request.headers.get("content-type")?.startsWith("application/json")) {
        throw new Error("invalid_request");
      }
      code = (await readJson(request, 4096) as Record<string, unknown> | null)
        ?.authorization_code;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    if (typeof code !== "string" || !code || code.length > APPLE_CODE_MAX) {
      return json({ error: "invalid_request" }, 400);
    }
    try {
      const subject = await services.appleSubject(userId);
      if (!subject) return json({ error: "not_apple_account" }, 403);
      const apple = await services.exchangeAppleCode(code);
      if (apple.subject !== subject) return json({ error: "apple_account_mismatch" }, 403);
      await services.storeRefreshToken(userId, apple.refreshToken);
    } catch {
      return json({ error: "apple_token_failed" }, 503);
    }
    return json({ stored: true });
  };
}
