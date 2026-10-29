import { createAppleTokenHandler } from "./handler.ts";

function assert(value: unknown) {
  if (!value) throw new Error("assertion_failed");
}
const userId = "16400000-0000-0000-0000-000000000001";
function request(payload: unknown, token: string | null = "valid") {
  return new Request("http://localhost/apple-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(payload),
  });
}
function setup(subject: string | null = "apple-sub", codeSubject = subject ?? "") {
  const stored: string[] = [];
  const handler = createAppleTokenHandler({
    authenticate: (token) =>
      token === "valid" ? Promise.resolve(userId) : Promise.reject(new Error("bad_token")),
    appleSubject: () => Promise.resolve(subject),
    exchangeAppleCode: (code) =>
      Promise.resolve({ subject: codeSubject, refreshToken: "refresh-" + code }),
    storeRefreshToken: (id, token) => {
      stored.push(id + ":" + token);
      return Promise.resolve();
    },
  });
  return { handler, stored };
}

Deno.test("가입한 애플 계정의 코드만 refresh token으로 바꿔 JWT 사용자에게 저장한다", async () => {
  const { handler, stored } = setup();
  const response = await handler(request({ authorization_code: "code", user_id: "other" }));
  assert(response.status === 200);
  assert(stored.length === 1 && stored[0] === userId + ":refresh-code");
});

Deno.test("인증이 없거나 애플 가입자가 아니거나 다른 애플 계정이면 저장하지 않는다", async () => {
  for (
    const [fixture, req, status] of [
      [setup(), request({ authorization_code: "code" }, null), 401],
      [setup(), request({ authorization_code: "code" }, "forged"), 401],
      [setup(null), request({ authorization_code: "code" }), 403],
      [setup("apple-sub", "someone-else"), request({ authorization_code: "code" }), 403],
      [setup(), request({ authorization_code: "" }), 400],
      [setup(), request({ authorization_code: "x".repeat(1025) }), 400],
    ] as const
  ) {
    assert((await fixture.handler(req)).status === status);
    assert(fixture.stored.length === 0);
  }
});
