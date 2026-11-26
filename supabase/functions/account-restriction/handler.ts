import { readJson } from "../_shared/readJson.ts";
import type { IdentityProvider } from "./identity.ts";

type Dependencies = {
  isConfigured: (provider: IdentityProvider) => boolean;
  verifyIdentity: (provider: IdentityProvider, token: string) => Promise<string>;
  lookupNotice: (provider: IdentityProvider, subject: string) => Promise<unknown>;
  lookupPolicies: (provider: IdentityProvider, subject: string) => Promise<unknown>;
};
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

export function createRestrictionHandler(deps: Dependencies) {
  return async (request: Request) => {
    const reply = (value: unknown, status = 200) =>
      Response.json(value, { status, headers: HEADERS });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
    if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
    let provider: IdentityProvider;
    let subject: string;
    let operation: unknown;
    try {
      if (!request.headers.get("content-type")?.startsWith("application/json")) {
        return reply({ error: "invalid_request" }, 400);
      }
      if (Number(request.headers.get("content-length")) > 16384) {
        return reply({ error: "invalid_request" }, 413);
      }
      const input = await readJson(request) as Record<string, unknown>;
      provider = input?.provider as IdentityProvider;
      operation = input?.operation;
      if (
        !["google", "kakao", "apple"].includes(provider) ||
        typeof input?.id_token !== "string" || input.id_token.length > 12000 ||
        (operation !== undefined && operation !== "login-consent")
      ) return reply({ error: "invalid_request" }, 400);
      if (!deps.isConfigured(provider)) return reply({ error: "provider_not_configured" }, 503);
      // 클라이언트의 UUID·이메일·subject 필드는 쓰지 않는다. 서명을 검증한 sub만 전달한다.
      subject = await deps.verifyIdentity(provider, input.id_token);
    } catch (error) {
      if (error instanceof Error && error.message === "request_too_large") {
        return reply({ error: "request_too_large" }, 413);
      }
      return reply({ error: "invalid_identity" }, 401);
    }
    try {
      const notice = await deps.lookupNotice(provider, subject);
      if (operation === "login-consent" && !notice) {
        return reply({ notice: null, policy_status: await deps.lookupPolicies(provider, subject) });
      }
      return reply({ notice });
    } catch {
      return reply({ error: "request_failed" }, 503);
    }
  };
}
