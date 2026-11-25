import { createClient } from "npm:@supabase/supabase-js@2.117.3";

import { createRestrictionHandler } from "./handler.ts";
import { createIdentityVerifier, type IdentityProvider } from "./identity.ts";

const PROVIDERS = {
  google: {
    issuer: "https://accounts.google.com",
    keys: "https://www.googleapis.com/oauth2/v3/certs",
    env: "GOOGLE_OIDC_AUDIENCES",
  },
  kakao: {
    issuer: "https://kauth.kakao.com",
    keys: "https://kauth.kakao.com/.well-known/jwks.json",
    env: "KAKAO_OIDC_AUDIENCES",
  },
  apple: {
    issuer: "https://appleid.apple.com",
    keys: "https://appleid.apple.com/auth/keys",
    env: "APPLE_OIDC_AUDIENCES",
  },
};
const verifyIdentity = createIdentityVerifier(
  Object.fromEntries(
    Object.entries(PROVIDERS).map((
      [name, value],
    ) => [
      name,
      Deno.env.get(value.env)?.split(",").map((value) => value.trim()).filter(Boolean) ?? [],
    ]),
  ) as Record<IdentityProvider, string[]>,
);
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
// 서명 검증 후에만 서비스 권한 RPC를 호출한다. 기존 제재 안내 호출은 그대로 지원한다.
Deno.serve(createRestrictionHandler({
  isConfigured: (provider) =>
    !!Deno.env.get(PROVIDERS[provider].env)?.split(",").some((value) => value.trim()),
  verifyIdentity,
  lookupNotice: async (provider, subject) => {
    const { data, error } = await client.rpc("lookup_suspended_identity", {
      identity_provider: provider,
      identity_subject: subject,
    });
    if (error) throw error;
    return data;
  },
  lookupPolicies: async (provider, subject) => {
    const { data, error } = await client.rpc("lookup_login_policy_status", {
      identity_provider: provider,
      identity_subject: subject,
    });
    if (error) throw error;
    return data;
  },
}));
