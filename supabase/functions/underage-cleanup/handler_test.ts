import { createUnderageCleanupHandler, type DueAccount } from "./handler.ts";

function assert(value: unknown) {
  if (!value) throw new Error("assertion_failed");
}
function request(token: string | null = "secret") {
  return new Request("http://localhost/underage-cleanup", {
    method: "POST",
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
}
function setup(accounts: DueAccount[], failRevoke = false, secret: string | undefined = "secret") {
  const calls: string[] = [];
  const handler = createUnderageCleanupHandler({
    secret,
    dueAccounts: () => Promise.resolve(accounts),
    revokeAppleToken: (token) => {
      calls.push("revoke:" + token);
      return failRevoke ? Promise.reject(new Error("x")) : Promise.resolve();
    },
    removeAvatars: (id) => {
      calls.push("avatars:" + id);
      return Promise.resolve();
    },
    deleteUser: (id) => {
      calls.push("user:" + id);
      return Promise.resolve();
    },
  });
  return { handler, calls };
}

Deno.test("전용 비밀값 없이 부르면 아무것도 지우지 않는다", async () => {
  const accounts = [{ user_id: "u1", apple_refresh_token: null }];
  for (
    const [fixture, token, status] of [
      [setup(accounts), null, 401],
      [setup(accounts), "forged", 401],
      [setup(accounts, false, ""), "secret", 503],
    ] as const
  ) {
    assert((await fixture.handler(request(token))).status === status);
    assert(fixture.calls.length === 0);
  }
});

Deno.test("애플 연결을 먼저 끊고 사진·계정 순서로 지운다", async () => {
  const { handler, calls } = setup([
    { user_id: "apple", apple_refresh_token: "token" },
    { user_id: "kakao", apple_refresh_token: null },
  ]);
  const response = await handler(request());
  assert((await response.json()).deleted === 2);
  assert(
    calls.join(",") === "revoke:token,avatars:apple,user:apple,avatars:kakao,user:kakao",
  );
});

Deno.test("애플 연결 해제가 실패하면 그 계정은 지우지 않고 다음에 다시 시도한다", async () => {
  const { handler, calls } = setup([{ user_id: "apple", apple_refresh_token: "token" }], true);
  const body = await (await handler(request())).json();
  assert(body.deleted === 0 && body.failed === 1);
  assert(!calls.some((call) => call.startsWith("user:")));
});
