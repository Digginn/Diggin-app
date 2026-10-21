import { createAdminHandler } from "./handler.ts";

function assert(value: unknown) {
  if (!value) throw new Error("assertion_failed");
}
const actor = {
  userId: "11400000-0000-0000-0000-000000000001",
  sessionId: "11400000-0000-0000-0001-000000000001",
};
const requestId = "11400000-0000-0000-0002-000000000001";
const userId = "11400000-0000-0000-0000-000000000002";
const body = {
  action: "sanction",
  request_id: requestId,
  user_id: userId,
  sanction: "suspended",
  reason_category: "abuse",
  reason: "운영정책 위반 확인",
};
function request(payload: unknown, token = "valid") {
  return new Request("http://localhost/admin-moderation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(payload),
  });
}

Deno.test("인증 없음·위조된 인증은 RPC 호출 없이 거부", async () => {
  let calls = 0;
  const handler = createAdminHandler({
    authenticate: () => Promise.reject(new Error("bad_token")),
    rpc: () => {
      calls++;
      return Promise.resolve(null);
    },
    updateAuth: () => Promise.resolve(),
  });
  assert((await handler(request(body, ""))).status === 401);
  assert((await handler(request(body))).status === 401);
  assert(calls === 0);
});
Deno.test("일반 사용자와 비활성 관리자는 DB 권한 검사를 통과할 수 없음", async () => {
  const handler = createAdminHandler({
    authenticate: () => Promise.resolve(actor),
    rpc: () => Promise.reject(new Error("admin_required")),
    updateAuth: () => Promise.reject(new Error("should_not_run")),
  });
  assert((await handler(request({ action: "list_reports" }))).status === 403);
});
Deno.test("본문의 관리자 사칭과 부정확한 bigint ID는 거부", async () => {
  let calls = 0;
  const handler = createAdminHandler({
    authenticate: () => Promise.resolve(actor),
    rpc: () => {
      calls++;
      return Promise.resolve(null);
    },
    updateAuth: () => Promise.resolve(),
  });
  assert((await handler(request({ ...body, actor: userId }))).status === 400);
  assert(
    (await handler(request({ action: "report_detail", report_id: 9007199254740992 }))).status ===
      400,
  );
  assert(calls === 0);
});
Deno.test("서비스 요청의 actor/session은 인증에서 가져오고 큰 ID는 문자열 보존", async () => {
  const handler = createAdminHandler({
    authenticate: () => Promise.resolve(actor),
    rpc: (_name, args) => {
      assert(args.actor === actor.userId && args.actor_session === actor.sessionId);
      assert(args.report === "9223372036854775807");
      return Promise.resolve({});
    },
    updateAuth: () => Promise.resolve(),
  });
  assert(
    (await handler(request({ action: "report_detail", report_id: "9223372036854775807" })))
      .status === 200,
  );
});
Deno.test("Auth 실패 시 미적용 요청만 종료하고 성공을 가장하지 않음", async () => {
  const calls: string[] = [];
  const handler = createAdminHandler({
    authenticate: () => Promise.resolve(actor),
    rpc: (name, args) => {
      calls.push(name);
      if (name === "admin_prepare_sanction") {
        return Promise.resolve({ state: "pending", user_id: userId, action: "suspended" });
      }
      assert(args.mark_failed === true);
      return Promise.resolve({ state: "failed" });
    },
    updateAuth: () => Promise.reject(new Error("auth_unavailable")),
  });
  const response = await handler(request(body));
  assert(
    response.status === 503 && calls.join(",") === "admin_prepare_sanction,admin_sanction_request",
  );
});
Deno.test("Auth 응답이 유실돼도 DB가 확정한 결과는 성공으로 복구", async () => {
  const handler = createAdminHandler({
    authenticate: () => Promise.resolve(actor),
    rpc: (name) =>
      Promise.resolve(
        name === "admin_prepare_sanction"
          ? { state: "pending", user_id: userId, action: "suspended" }
          : { state: "applied", action_id: "71" },
      ),
    updateAuth: () => Promise.reject(new Error("response_lost")),
  });
  const response = await handler(request(body));
  assert(response.status === 200 && (await response.json()).action_id === "71");
});
Deno.test("이미 완료한 요청을 재시도하면 Auth ban과 감사 이력을 중복 실행하지 않음", async () => {
  let authCalls = 0;
  const handler = createAdminHandler({
    authenticate: () => Promise.resolve(actor),
    rpc: () => Promise.resolve({ state: "applied", action_id: "71" }),
    updateAuth: () => {
      authCalls++;
      return Promise.resolve();
    },
  });
  assert((await handler(request(body))).status === 200 && authCalls === 0);
});
Deno.test("제재 종류별 Auth 인자와 서버 확정 결과를 확인", async () => {
  for (const sanction of ["warning", "community_restricted", "suspended", "release"]) {
    const handler = createAdminHandler({
      authenticate: () => Promise.resolve(actor),
      rpc: (name) =>
        Promise.resolve(
          name === "admin_prepare_sanction"
            ? { state: "pending", user_id: userId, action: sanction }
            : { state: "applied" },
        ),
      updateAuth: (user, attributes) => {
        assert(user === userId);
        assert(
          (attributes.app_metadata as Record<string, unknown>).moderation_request_id === requestId,
        );
        assert(
          attributes.ban_duration ===
            (sanction === "suspended" ? "876000h" : sanction === "release" ? "none" : undefined),
        );
        return Promise.resolve();
      },
    });
    assert((await handler(request({ ...body, sanction }))).status === 200);
  }
});

Deno.test("Content-Length가 없는 16KiB 초과 요청은 RPC 없이 거부", async () => {
  let calls = 0;
  const handler = createAdminHandler({
    authenticate: () => Promise.resolve(actor),
    rpc: () => {
      calls++;
      return Promise.resolve(null);
    },
    updateAuth: () => Promise.resolve(),
  });
  assert((await handler(request({ ...body, reason: "a".repeat(16384) }))).status === 413);
  assert(calls === 0);
});
