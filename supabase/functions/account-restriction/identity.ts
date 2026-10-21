import { createRemoteJWKSet, customFetch, jwtVerify } from "npm:jose@6.1.0";

const PROVIDERS = {
  google: {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    keys: "https://www.googleapis.com/oauth2/v3/certs",
  },
  kakao: {
    issuer: ["https://kauth.kakao.com"],
    keys: "https://kauth.kakao.com/.well-known/jwks.json",
  },
  apple: { issuer: ["https://appleid.apple.com"], keys: "https://appleid.apple.com/auth/keys" },
};
export type IdentityProvider = keyof typeof PROVIDERS;

export function createIdentityVerifier(
  audiences: Record<IdentityProvider, string[]>,
  fetchKeys: typeof fetch = fetch,
) {
  const sets = Object.fromEntries(
    Object.entries(PROVIDERS).map((
      [name, value],
    ) => [name, createRemoteJWKSet(new URL(value.keys), { [customFetch]: fetchKeys })]),
  );
  return async (provider: IdentityProvider, token: string) => {
    if (!Object.hasOwn(PROVIDERS, provider) || !audiences[provider]?.length) {
      throw new Error("invalid_identity");
    }
    const { payload } = await jwtVerify(token, sets[provider], {
      issuer: PROVIDERS[provider].issuer,
      audience: audiences[provider],
      algorithms: ["RS256"],
    });
    if (!payload.sub || typeof payload.exp !== "number") throw new Error("invalid_identity");
    return payload.sub;
  };
}
