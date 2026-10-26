import { createCsvImportHandler, type ImportRequest } from "./handler.ts";

function assert(value: unknown) {
  if (!value) throw new Error("assertion_failed");
}
const userId = "12000000-0000-0000-0000-000000000001";
const payload: ImportRequest = {
  request_id: "12000000-0000-0000-0000-000000000002",
  import_plan: { userId, totalCount: 10, products: [] },
};
function request(body: unknown = payload, token = "valid") {
  return new Request("http://localhost/csv-import", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}
const authenticate = (token: string) =>
  token === "valid" ? Promise.resolve({ userId, sessionId: "session" }) : Promise.reject();

Deno.test("본인 인증 전 또는 다른 계정의 저장 계획이면 DB 연결을 만들지 않는다", async () => {
  let saves = 0;
  const handler = createCsvImportHandler({
    authenticate,
    save: () => {
      saves++;
      return Promise.resolve();
    },
  });
  for (
    const [input, status] of [
      [request(payload, "invalid"), 401],
      [request({ ...payload, import_plan: { userId: "someone-else" } }), 403],
      [request({ ...payload, request_id: "bad" }), 400],
      [request(null), 400],
    ] as const
  ) {
    const response = await handler(input);
    assert(response.status === status);
    await response.body?.cancel();
  }
  assert(saves === 0);
});

Deno.test("COMMIT을 기다리는 동안에도 중간 건수를 먼저 전송한다", async () => {
  let commit!: () => void;
  const committed = new Promise<void>((resolve) => {
    commit = resolve;
  });
  const handler = createCsvImportHandler({
    authenticate,
    save: async (user, input, progress) => {
      assert(
        user.userId === userId && user.sessionId === "session" &&
          input.request_id === payload.request_id,
      );
      progress({ completed: 3, total: 10 });
      await committed;
      return { importedCount: 10, excludedProducts: [], folderFailures: [] };
    },
  });
  const response = await handler(request());
  assert(response.headers.get("content-type")?.startsWith("application/x-ndjson"));
  const reader = response.body!.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert(JSON.parse(first).completed === 3 && !first.includes('"result"'));
  commit();
  const final = new TextDecoder().decode((await reader.read()).value);
  assert(JSON.parse(final).type === "result");
  assert((await reader.read()).done);
  reader.releaseLock();
});

Deno.test("처리 도중 DB 오류면 성공 대신 오류 코드만 전송하고 내부 상세를 숨긴다", async () => {
  const handler = createCsvImportHandler({
    authenticate,
    save: (_user, _input, progress) => {
      progress({ completed: 2, total: 10 });
      return Promise.reject(Object.assign(new Error("private SQL secret"), { code: "40001" }));
    },
  });
  const text = await (await handler(request())).text();
  const events = text.trim().split("\n").map((line) => JSON.parse(line));
  assert(events.length === 2 && events[1].type === "error" && events[1].code === "40001");
  assert(!text.includes("private SQL") && !text.includes('"result"'));
});

Deno.test("응답 스트림 취소는 저장 연결의 취소 신호로 전달한다", async () => {
  let cancelled!: () => void;
  const stopped = new Promise<void>((resolve) => {
    cancelled = resolve;
  });
  const handler = createCsvImportHandler({
    authenticate,
    save: (_user, _input, progress, signal) => {
      progress({ completed: 1, total: 10 });
      return new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => {
          cancelled();
          reject(new Error("cancelled"));
        }, { once: true })
      );
    },
  });
  const response = await handler(request());
  await response.body!.cancel();
  await stopped;
});
