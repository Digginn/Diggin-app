import { createRestrictionHandler } from "./handler.ts";

function assert(value: unknown, message = "assertion_failed"): asserts value {
  if (!value) throw new Error(message);
}
function request(body: unknown) {
  return new Request("https://example.test/account-restriction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("동의 사전 확인은 검증된 subject만 조회하며 계정 정보 대신 상태만 반환한다", async () => {
  const calls: string[] = [];
  const handler = createRestrictionHandler({
    isConfigured: () => true,
    verifyIdentity: (provider, token) => {
      assert(provider === "google" && token === "signed-token");
      calls.push("verify");
      return Promise.resolve("verified-subject");
    },
    lookupNotice: (_provider, subject) => {
      assert(subject === "verified-subject");
      calls.push("notice");
      return Promise.resolve(null);
    },
    lookupPolicies: (_provider, subject) => {
      assert(subject === "verified-subject");
      calls.push("policies");
      return Promise.resolve({
        requires_consent: false,
        is_new_user: false,
        terms_policy_id: 1,
        privacy_policy_id: 2,
      });
    },
  });
  const response = await handler(request({
    provider: "google",
    id_token: "signed-token",
    operation: "login-consent",
    subject: "forged-subject",
    user_id: "forged-user",
    email: "forged@example.test",
  }));
  assert(response.status === 200);
  assert(response.headers.get("cache-control") === "no-store");
  const body = await response.json();
  assert(body.policy_status.requires_consent === false);
  assert(!("user_id" in body) && !("email" in body));
  assert(calls.join(",") === "verify,notice,policies");
});

Deno.test("동의 확인에 유효한 토큰이 없으면 서비스 권한 조회는 실행되지 않는다", async () => {
  let reads = 0;
  const handler = createRestrictionHandler({
    isConfigured: () => true,
    verifyIdentity: () => Promise.reject(new Error("invalid_signature")),
    lookupNotice: () => {
      reads++;
      return Promise.resolve(null);
    },
    lookupPolicies: () => {
      reads++;
      return Promise.resolve({});
    },
  });
  for (
    const [input, status] of [
      [{ provider: "google", id_token: "invalid", operation: "login-consent" }, 401],
      [{ provider: "google", email: "someone@example.test", operation: "login-consent" }, 400],
      [{ provider: "unknown", id_token: "invalid", operation: "login-consent" }, 400],
      [{ provider: "google", id_token: "invalid", operation: "unknown" }, 400],
      [null, 400],
    ] as const
  ) {
    assert((await handler(request(input))).status === status);
  }
  assert(reads === 0);
});

Deno.test("기존 제재 안내·정지 계정은 약관 확인을 추가 호출하지 않는다", async () => {
  for (
    const [operation, notice] of [[undefined, null], ["login-consent", { status: "suspended" }]]
  ) {
    const handler = createRestrictionHandler({
      isConfigured: () => true,
      verifyIdentity: () => Promise.resolve("subject"),
      lookupNotice: () => Promise.resolve(notice),
      lookupPolicies: () => {
        throw new Error("must_not_lookup_policies");
      },
    });
    const response = await handler(request({ provider: "kakao", id_token: "signed", operation }));
    assert(response.status === 200);
    const body = await response.json();
    assert(JSON.stringify(body.notice) === JSON.stringify(notice));
    assert(!("policy_status" in body));
  }
});

Deno.test("조회 실패·설정 누락은 동의 완료로 오인하지 않는다", async () => {
  const deps = {
    isConfigured: () => true,
    verifyIdentity: () => Promise.resolve("subject"),
    lookupNotice: () => Promise.resolve(null),
    lookupPolicies: () => Promise.reject(new Error("database_unavailable")),
  };
  const input = { provider: "apple", id_token: "signed", operation: "login-consent" };
  assert((await createRestrictionHandler(deps)(request(input))).status === 503);
  assert(
    (await createRestrictionHandler({ ...deps, isConfigured: () => false })(request(input)))
      .status === 503,
  );
});
