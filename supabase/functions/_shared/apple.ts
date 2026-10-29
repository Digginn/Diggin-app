import { decodeJwt, importPKCS8, SignJWT } from "npm:jose@6.1.0";

const APPLE = "https://appleid.apple.com";
// app.config.ts의 IOS_BUNDLE_ID. 앱의 애플 인증 코드는 이 번들 ID로 발급된다.
const APPLE_CLIENT_ID = "com.diggin.app.preview";

async function appleClientSecret() {
  const key = await importPKCS8(Deno.env.get("APPLE_PRIVATE_KEY") ?? "", "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: Deno.env.get("APPLE_KEY_ID") })
    .setIssuer(Deno.env.get("APPLE_TEAM_ID") ?? "")
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience(APPLE)
    .setSubject(APPLE_CLIENT_ID)
    .sign(key);
}

async function applePost(path: "token" | "revoke", params: Record<string, string>) {
  const response = await fetch(`${APPLE}/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: APPLE_CLIENT_ID,
      client_secret: await appleClientSecret(),
      ...params,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`apple_${path}_failed`);
  return response;
}

export async function exchangeAppleCode(code: string) {
  const response = await applePost("token", { code, grant_type: "authorization_code" });
  const body = await response.json() as Record<string, unknown>;
  if (typeof body.refresh_token !== "string" || typeof body.id_token !== "string") {
    throw new Error("apple_token_invalid");
  }
  // Apple 서버에서 TLS로 직접 받은 토큰이라 서명 검증 없이 계정 ID만 읽는다.
  const { sub } = decodeJwt(body.id_token);
  if (typeof sub !== "string" || !sub) throw new Error("apple_token_invalid");
  return { subject: sub, refreshToken: body.refresh_token };
}

export async function revokeAppleToken(refreshToken: string) {
  await applePost("revoke", { token: refreshToken, token_type_hint: "refresh_token" });
}
