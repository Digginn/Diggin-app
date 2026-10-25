/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function setup(fetch, session = { access_token: "test-token" }) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(
      readFileSync(path.join(__dirname, "../src/screens/my/api/streamCsvImport.ts"), "utf8"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      },
    ).outputText,
    {
      module,
      exports: module.exports,
      TextDecoder,
      AbortController,
      setTimeout,
      clearTimeout,
      process: {
        env: {
          EXPO_PUBLIC_SUPABASE_URL: "https://project.test",
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        },
      },
      require: (name) =>
        name === "expo/fetch"
          ? { fetch }
          : {
              supabase: { auth: { getSession: async () => ({ data: { session }, error: null }) } },
            },
    },
  );
  return module.exports.streamCsvImport;
}
const payload = { request_id: "request", import_plan: { userId: "user" } };
const encode = (event) => new TextEncoder().encode(JSON.stringify(event) + "\n");
function response(events, tail = "") {
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const event of events) controller.enqueue(encode(event));
        if (tail) controller.enqueue(new TextEncoder().encode(tail));
        controller.close();
      },
    }),
  };
}

test("저장 완료 전 스트림의 실제 건수를 즉시 전달하고 최종 결과까지 기다린다", async () => {
  let controller, options;
  let finishProgress;
  const progressed = new Promise((resolve) => {
    finishProgress = resolve;
  });
  const run = setup(async (url, init) => {
    assert.equal(url, "https://project.test/functions/v1/csv-import");
    options = init;
    return {
      ok: true,
      body: new ReadableStream({
        start(value) {
          controller = value;
        },
      }),
    };
  });
  let finished = false;
  const values = [];
  const promise = run(payload, 100, (value) => {
    values.push(value.completed);
    finishProgress();
  }).then((result) => {
    finished = true;
    return result;
  });
  // fetch와 reader 초기화 이후에도 완료 응답을 보내지 않는다.
  await new Promise((resolve) => setImmediate(resolve));
  controller.enqueue(encode({ type: "progress", completed: 25, total: 100 }));
  await progressed;
  assert.deepEqual(values, [25]);
  assert.equal(finished, false);
  assert.equal(options.headers.Authorization, "Bearer test-token");
  const final = {
    importedCount: 99,
    excludedProducts: [
      { productName: "한글 상품", kind: "failed", reason: "INVALID_PRODUCT_DATA" },
    ],
    folderFailures: [],
  };
  const bytes = encode({ type: "result", data: final });
  // UTF-8와 JSON이 네트워크 청크 경계에서 잘려도 누락되지 않는다.
  for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
  controller.close();
  assert.deepEqual(JSON.parse(JSON.stringify(await promise)), final);
});

test("중간 진행 후 연결 단절·서버 오류는 완료로 처리하지 않고 재시도 코드를 보존한다", async () => {
  const run = setup(async () => response([{ type: "progress", completed: 2, total: 10 }]));
  const values = [];
  await assert.rejects(
    run(payload, 10, (value) => values.push(value.completed)),
    /중단/,
  );
  assert.deepEqual(values, [2]);
  const conflict = setup(async () =>
    response([
      { type: "progress", completed: 2, total: 10 },
      { type: "error", code: "40001" },
    ]),
  );
  await assert.rejects(
    conflict(payload, 10, () => {}),
    (error) => error.code === "40001",
  );
});

test("역행·범위 초과·잘못된 전체 건수·완료 없는 응답과 손상된 JSON을 거부한다", async () => {
  for (const events of [
    [{ type: "progress", completed: 10, total: 10 }],
    [{ type: "progress", completed: 1, total: 11 }],
    [{ type: "progress", completed: 1.5, total: 10 }],
    [
      { type: "progress", completed: 4, total: 10 },
      { type: "progress", completed: 3, total: 10 },
    ],
    [
      { type: "result", data: {} },
      { type: "progress", completed: 1, total: 10 },
    ],
  ]) {
    await assert.rejects(setup(async () => response(events))(payload, 10, () => {}));
  }
  await assert.rejects(setup(async () => response([], "{bad"))(payload, 10, () => {}));
  await assert.rejects(setup(async () => ({ ok: false }))(payload, 10, () => {}));
  await assert.rejects(
    setup(() => assert.fail("로그인 전 요청 금지"), null)(payload, 10, () => {}),
  );
});
