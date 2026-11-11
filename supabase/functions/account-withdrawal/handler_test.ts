import { createWithdrawalHandler } from "./handler.ts";

function assert(value: unknown) {
  if (!value) throw new Error("assertion_failed");
}
const userId = "12000000-0000-0000-0000-000000000001";
function request(payload: unknown, token: string | null = "valid") {
  return new Request("http://localhost/account-withdrawal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(payload),
  });
}
function setup(
  fail: Partial<Record<"avatars" | "user" | "survey" | "appleToken" | "appleRevoke", boolean>> = {},
  apple: { subject: string | null; codeSubject?: string } = { subject: null },
) {
  const calls: string[] = [];
  const handler = createWithdrawalHandler({
    authenticate: (token) =>
      token === "valid" ? Promise.resolve(userId) : Promise.reject(new Error("bad_token")),
    appleSubject: () => Promise.resolve(apple.subject),
    exchangeAppleCode: (code) => {
      calls.push("apple-token:" + code);
      return fail.appleToken ? Promise.reject(new Error("x")) : Promise.resolve({
        subject: apple.codeSubject ?? apple.subject ?? "",
        refreshToken: "refresh-" + code,
      });
    },
    revokeAppleToken: (token) => {
      calls.push("apple-revoke:" + token);
      return fail.appleRevoke ? Promise.reject(new Error("x")) : Promise.resolve();
    },
    removeAvatars: (id) => {
      calls.push("avatars:" + id);
      return fail.avatars ? Promise.reject(new Error("x")) : Promise.resolve();
    },
    deleteUser: (id) => {
      calls.push("user:" + id);
      return fail.user ? Promise.reject(new Error("x")) : Promise.resolve();
    },
    recordSurvey: (survey) => {
      calls.push("survey:" + JSON.stringify(survey));
      return fail.survey ? Promise.reject(new Error("x")) : Promise.resolve();
    },
  });
  return { handler, calls };
}

Deno.test("인증이 없거나 위조되면 아무것도 지우지 않는다", async () => {
  const { handler, calls } = setup();
  assert((await handler(request({ reasons: ["rarely_used"] }, null))).status === 401);
  assert((await handler(request({ reasons: ["rarely_used"] }, "forged"))).status === 401);
  assert(calls.length === 0);
});

Deno.test("사진 → 계정 → 설문 순서로 지우고, 본문의 사용자 값은 쓰지 않는다", async () => {
  const { handler, calls } = setup();
  const response = await handler(
    request({ reasons: ["rarely_used", "hard_to_use"], custom_text: "  ", user_id: "other" }),
  );
  assert(response.status === 200);
  assert((await response.json()).withdrawn === true);
  assert(
    JSON.stringify(calls) === JSON.stringify([
      "avatars:" + userId,
      "user:" + userId,
      'survey:{"reasons":["rarely_used","hard_to_use"],"customText":null}',
    ]),
  );
});

Deno.test("잘못된 설문은 지우기 전에 거부한다", async () => {
  for (
    const payload of [
      { reasons: ["unknown"] },
      { reasons: ["rarely_used", "rarely_used"] },
      { reasons: ["rarely_used"], custom_text: "가".repeat(101) },
      { reasons: "rarely_used" },
      [],
    ]
  ) {
    const { handler, calls } = setup();
    assert((await handler(request(payload))).status === 400);
    assert(calls.length === 0);
  }
  const { handler } = setup();
  assert((await handler(request({ reasons: [], custom_text: "가".repeat(100) }))).status === 200);
});

Deno.test("직접 작성은 앱 화면처럼 조합 이모지를 1자로 센다", async () => {
  // 👍🏻는 UTF-16으로 4, 코드 포인트로 2지만 화면에서는 1자다.
  for (const [text, status] of [["👍🏻".repeat(100), 200], ["👍🏻".repeat(101), 400]] as const) {
    const { handler, calls } = setup();
    assert((await handler(request({ reasons: [], custom_text: text }))).status === status);
    assert(calls.length === (status === 200 ? 3 : 0));
  }
  const { handler, calls } = setup();
  const decomposed = "탈퇴".normalize("NFD").repeat(50);
  assert((await handler(request({ reasons: [], custom_text: decomposed }))).status === 200);
  assert(calls[2] === `survey:${JSON.stringify({ reasons: [], customText: "탈퇴".repeat(50) })}`);
});

Deno.test("사진이나 계정 삭제에 실패하면 실패로 알리고 설문은 남기지 않는다", async () => {
  for (const fail of [{ avatars: true }, { user: true }]) {
    const { handler, calls } = setup(fail);
    const response = await handler(request({ reasons: ["rarely_used"] }));
    assert(response.status === 503);
    assert(!calls.some((call) => call.startsWith("survey:")));
    if (fail.avatars) assert(!calls.some((call) => call.startsWith("user:")));
  }
});

Deno.test("계정을 지운 뒤 설문 저장이 실패해도 탈퇴는 성공이다", async () => {
  const { handler } = setup({ survey: true });
  assert((await handler(request({ reasons: ["rarely_used"] }))).status === 200);
});

Deno.test("애플 가입자는 재인증 코드로 토큰을 해지한 뒤에 지운다", async () => {
  const { handler, calls } = setup({}, { subject: "apple-sub" });
  const response = await handler(
    request({ reasons: ["rarely_used"], apple_authorization_code: "code-1" }),
  );
  assert(response.status === 200);
  assert(
    JSON.stringify(calls.slice(0, 4)) === JSON.stringify([
      "apple-token:code-1",
      "apple-revoke:refresh-code-1",
      "avatars:" + userId,
      "user:" + userId,
    ]),
  );
});

Deno.test("애플 가입자가 코드 없이 오거나 다른 애플 계정으로 재인증하면 지우지 않는다", async () => {
  const missing = setup({}, { subject: "apple-sub" });
  const noCode = await missing.handler(request({ reasons: ["rarely_used"] }));
  assert(noCode.status === 400);
  assert((await noCode.json()).error === "apple_reauth_required");
  assert(missing.calls.length === 0);

  const other = setup({}, { subject: "apple-sub", codeSubject: "someone-else" });
  const mismatch = await other.handler(
    request({ reasons: ["rarely_used"], apple_authorization_code: "code-2" }),
  );
  assert(mismatch.status === 403);
  assert(!other.calls.some((call) => call.startsWith("apple-revoke:")));
  assert(!other.calls.some((call) => call.startsWith("user:")));
});

Deno.test("애플 토큰 발급이나 해지에 실패하면 계정을 남기고 실패로 알린다", async () => {
  for (const fail of [{ appleToken: true }, { appleRevoke: true }]) {
    const { handler, calls } = setup(fail, { subject: "apple-sub" });
    const response = await handler(
      request({ reasons: ["rarely_used"], apple_authorization_code: "code-3" }),
    );
    assert(response.status === 503);
    assert((await response.json()).error === "apple_revoke_failed");
    assert(!calls.some((call) => call.startsWith("avatars:") || call.startsWith("user:")));
  }
});

Deno.test("애플 가입자가 아니면 코드를 보내도 애플을 부르지 않는다", async () => {
  const { handler, calls } = setup();
  const response = await handler(
    request({ reasons: ["rarely_used"], apple_authorization_code: "code-4" }),
  );
  assert(response.status === 200);
  assert(!calls.some((call) => call.startsWith("apple-")));
});

Deno.test("잘못된 애플 코드 형식은 지우기 전에 거부한다", async () => {
  for (const code of ["", 1, "a".repeat(1025)]) {
    const { handler, calls } = setup({}, { subject: "apple-sub" });
    const payload = { reasons: ["rarely_used"], apple_authorization_code: code };
    assert((await handler(request(payload))).status === 400);
    assert(calls.length === 0);
  }
});

Deno.test("설문을 고르지 않아도 탈퇴하고 빈 설문은 남기지 않는다", async () => {
  for (const payload of [{ reasons: [] }, { reasons: [], custom_text: "   " }]) {
    const { handler, calls } = setup();
    const response = await handler(request(payload));
    assert(response.status === 200);
    assert(calls.some((call) => call.startsWith("user:")));
    assert(!calls.some((call) => call.startsWith("survey:")));
  }
});
