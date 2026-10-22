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
function setup(fail: Partial<Record<"avatars" | "user" | "survey", boolean>> = {}) {
  const calls: string[] = [];
  const handler = createWithdrawalHandler({
    authenticate: (token) =>
      token === "valid" ? Promise.resolve(userId) : Promise.reject(new Error("bad_token")),
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
      { reasons: [] },
      { reasons: [], custom_text: "   " },
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
