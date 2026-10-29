import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { decodeJwt, importPKCS8, SignJWT } from "npm:jose@6.1.0";

import { createWithdrawalHandler } from "./handler.ts";

const AVATAR_BUCKET = "avatars";
const AVATAR_PAGE = 100;
const APPLE = "https://appleid.apple.com";
// app.config.ts의 IOS_BUNDLE_ID. 앱의 애플 인증 코드는 이 번들 ID로 발급된다.
const APPLE_CLIENT_ID = "com.diggin.app.preview";

const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

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

Deno.serve(createWithdrawalHandler({
  async authenticate(token) {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw new Error("not_authenticated");
    return data.user.id;
  },
  async appleSubject(userId) {
    const { data, error } = await client.auth.admin.getUserById(userId);
    if (error || !data.user) throw new Error("user_lookup_failed");
    const identity = data.user.identities?.find((item) => item.provider === "apple");
    if (!identity) return null;
    const subject = identity.identity_data?.sub;
    if (typeof subject !== "string" || !subject) throw new Error("apple_subject_missing");
    return subject;
  },
  async exchangeAppleCode(code) {
    const response = await applePost("token", { code, grant_type: "authorization_code" });
    const body = await response.json() as Record<string, unknown>;
    if (typeof body.refresh_token !== "string" || typeof body.id_token !== "string") {
      throw new Error("apple_token_invalid");
    }
    // Apple 서버에서 TLS로 직접 받은 토큰이라 서명 검증 없이 계정 ID만 읽는다.
    const { sub } = decodeJwt(body.id_token);
    if (typeof sub !== "string" || !sub) throw new Error("apple_token_invalid");
    return { subject: sub, refreshToken: body.refresh_token };
  },
  async revokeAppleToken(refreshToken) {
    await applePost("revoke", { token: refreshToken, token_type_hint: "refresh_token" });
  },
  async removeAvatars(userId) {
    const bucket = client.storage.from(AVATAR_BUCKET);
    while (true) {
      const { data, error } = await bucket.list(userId, { limit: AVATAR_PAGE });
      if (error) throw new Error("avatar_list_failed");
      if (!data.length) return;
      const { error: removeError } = await bucket.remove(
        data.map((file) => `${userId}/${file.name}`),
      );
      if (removeError) throw new Error("avatar_remove_failed");
      if (data.length < AVATAR_PAGE) return;
    }
  },
  // auth.users를 지우면 세션·리프레시 토큰과 FK로 묶인 데이터가 함께 지워진다(DB_SCHEMA 8).
  async deleteUser(userId) {
    const { error } = await client.auth.admin.deleteUser(userId);
    if (error) throw new Error("delete_user_failed");
  },
  async recordSurvey({ reasons, customText }) {
    const { error } = await client.rpc("record_withdrawal_survey", {
      reasons,
      custom_text: customText,
    });
    if (error) throw new Error("record_survey_failed");
  },
}));
