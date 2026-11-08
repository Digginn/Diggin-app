import { createClient } from "npm:@supabase/supabase-js@2.117.3";

import { readJson } from "../_shared/readJson.ts";
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
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

// Auth ban으로 세션을 받지 못해도 유효한 제공자 ID token으로 본인 안내만 조회한다.
Deno.serve(async (request: Request) => {
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return reply({ error: "invalid_request" }, 400);
    }
    if (Number(request.headers.get("content-length")) > 16384) {
      return reply({ error: "invalid_request" }, 413);
    }
    const input = await readJson(request) as Record<string, unknown>;
    const provider = input?.provider as keyof typeof PROVIDERS;
    if (
      !Object.hasOwn(PROVIDERS, provider) || typeof input?.id_token !== "string" ||
      input.id_token.length > 12000
    ) return reply({ error: "invalid_request" }, 400);
    const config = PROVIDERS[provider];
    const audience = Deno.env.get(config.env)?.split(",").map((value) => value.trim()).filter(
      Boolean,
    );
    if (!audience?.length) return reply({ error: "provider_not_configured" }, 503);
    const subject = await verifyIdentity(provider, input.id_token);
    const { data, error } = await client.rpc("lookup_suspended_identity", {
      identity_provider: provider,
      identity_subject: subject,
    });
    if (error) return reply({ error: "request_failed" }, 503);
    return reply({ notice: data });
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large") {
      return reply({ error: "request_too_large" }, 413);
    }
    return reply({ error: "invalid_identity" }, 401);
  }
});
