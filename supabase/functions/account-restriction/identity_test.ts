import { exportJWK, generateKeyPair, SignJWT } from "npm:jose@6.1.0";

import { createIdentityVerifier } from "./identity.ts";

function assert(value: unknown) {
  if (!value) throw new Error("assertion_failed");
}
Deno.test("제공자 JWT는 서명·issuer·audience·만료를 모두 검증", async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...await exportJWK(keys.publicKey), kid: "fixture", alg: "RS256", use: "sig" };
  const verify = createIdentityVerifier({
    google: ["diggin-google"],
    kakao: ["diggin-kakao"],
    apple: ["diggin-apple"],
  }, () => Promise.resolve(Response.json({ keys: [jwk] })));
  function token(
    issuer: string,
    audience: string,
    expiry: string | number = "5m",
    key = keys.privateKey,
  ) {
    return new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "fixture" }).setSubject(
      "verified-subject",
    ).setIssuer(issuer).setAudience(audience).setExpirationTime(expiry).sign(key);
  }
  assert(
    await verify("google", await token("https://accounts.google.com", "diggin-google")) ===
      "verified-subject",
  );
  assert(
    await verify("kakao", await token("https://kauth.kakao.com", "diggin-kakao")) ===
      "verified-subject",
  );
  assert(
    await verify("apple", await token("https://appleid.apple.com", "diggin-apple")) ===
      "verified-subject",
  );
  const wrongKeys = await generateKeyPair("RS256");
  for (
    const invalid of [
      await token("https://evil.test", "diggin-google"),
      await token("https://accounts.google.com", "other-app"),
      await token("https://accounts.google.com", "diggin-google", 0),
      await token("https://accounts.google.com", "diggin-google", "5m", wrongKeys.privateKey),
    ]
  ) {
    let rejected = false;
    try {
      await verify("google", invalid);
    } catch {
      rejected = true;
    }
    assert(rejected);
  }
});
