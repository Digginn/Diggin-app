/* global __dirname */
const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const Papa = require("papaparse");
const ts = require("typescript");

const analyticsEvents = [];
const analytics = {
  trackEvent: (name, properties) => analyticsEvents.push([name, properties]),
  flushAnalytics: async () => {},
  setAnalyticsUser() {},
};

function load(relativePath, overrides = {}) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, relativePath), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText,
    {
      module,
      exports: module.exports,
      TextDecoder,
      URL,
      require: (name) =>
        overrides[name] ?? (name === "@/lib/analytics" ? analytics : undefined) ?? require(name),
    },
  );
  return module.exports;
}

const domain = load("../src/screens/my/domain/prepareCsvImport.ts");
const currency = load("../src/screens/my/domain/isKrwCsvSource.ts");
function setup({
  folders = [],
  sources = {},
  rpc,
  storage = new Map(),
  user = { id: "user-a" },
  bytes,
} = {}) {
  const calls = [];
  const progress = [];
  const fileBytes =
    bytes ??
    new TextEncoder().encode(
      Papa.unparse([
        domain.CSV_REQUIRED_HEADERS,
        [
          "상품",
          "확인되지 않은 스토어",
          "브랜드",
          "100",
          "0",
          "2026-10-12 09:00:00",
          "abcdefg-long",
          "Y",
          "https://shop.test/product",
        ],
      ]),
    );
  const storageApi = {
    getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => storage.set(key, value),
    removeItem: async (key) => storage.delete(key),
  };
  let folderQueryCount = 0;
  const api = load("../src/screens/my/api/importCsv.ts", {
    "@react-native-async-storage/async-storage": storageApi,
    "expo-crypto": {
      CryptoDigestAlgorithm: { SHA256: "sha256" },
      randomUUID,
      digest: async (algorithm, data) => {
        const bytes = createHash(algorithm).update(data).digest();
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
    },
    "expo-file-system": {
      File: class {
        get size() {
          return fileBytes.byteLength;
        }
        async arrayBuffer() {
          return fileBytes.buffer.slice(
            fileBytes.byteOffset,
            fileBytes.byteOffset + fileBytes.byteLength,
          );
        }
      },
    },
    "../domain/prepareCsvImport": domain,
    "../domain/isKrwCsvSource": currency,
    "./streamCsvImport": {
      streamCsvImport: async (payload) => {
        const copy = JSON.parse(JSON.stringify(payload));
        calls.push(copy);
        const response = rpc
          ? await rpc(copy, calls.length)
          : { data: { importedCount: 1, excludedProducts: [], folderFailures: [] }, error: null };
        if (response.error) throw response.error;
        return response.data;
      },
    },
    "@/lib/supabase": {
      supabase: {
        auth: { getUser: async () => ({ data: { user }, error: null }) },
        from: (table) => {
          assert.equal(table, "folders");
          const filters = [];
          const query = {
            select: (columns) => {
              assert.equal(columns, "name,csv_source_name");
              return query;
            },
            eq: (...args) => {
              filters.push(args);
              return query;
            },
            then: (resolve) => {
              assert.deepEqual(filters, [
                ["user_id", user.id],
                ["kind", "custom"],
              ]);
              const names = typeof folders === "function" ? folders(folderQueryCount++) : folders;
              return resolve({
                data: names.map((name) => ({ name, csv_source_name: sources[name] ?? null })),
                error: null,
              });
            },
          };
          return query;
        },
      },
    },
  });
  const run = (confirmFolderLimit) =>
    api.importCsv(
      { name: "wishlist.csv", uri: "file:///wishlist.csv" },
      (value) => progress.push(JSON.parse(JSON.stringify(value))),
      confirmFolderLimit,
    );
  return { run, calls, progress, storage };
}

test("실제 파일 바이트를 파싱하고 한국 등록일·소장 관계·원본 버킷을 서버에 전달한다", async () => {
  const { run, calls, progress, storage } = setup({ folders: ["abcdefg"] });
  const result = await run();
  assert.equal(result.importedCount, 1);
  const { import_plan: plan } = calls[0];
  assert.equal(plan.userId, "user-a");
  assert.deepEqual(plan.folderMappings, [{ sourceName: "abcdefg-long", folderName: "abcdef2" }]);
  assert.equal(plan.products[0].savedAt, "2026-10-12T00:00:00.000Z");
  assert.equal(plan.products[0].isOwned, true);
  assert.equal(plan.products[0].price, null);
  assert.deepEqual(plan.products[0].sourceFolderNames, ["abcdefg-long"]);
  assert.deepEqual(progress, [
    { completed: 0, total: 1 },
    { completed: 1, total: 1 },
  ]);
  assert.equal(storage.size, 0);
});

test("새 요청으로 재업로드해도 저장된 원본 버킷의 폴더를 재사용한다", async () => {
  const { run, calls } = setup({
    folders: ["바꾼이름"],
    sources: { 바꾼이름: "abcdefg-long" },
  });
  await run();
  assert.deepEqual(calls[0].import_plan.folderMappings, [
    { sourceName: "abcdefg-long", folderName: "바꾼이름" },
  ]);
  assert.deepEqual(calls[0].import_plan.products[0].folderNames, ["바꾼이름"]);
});

test("IMP-005 승인 판매처 가격을 실제 가져오기 RPC에 전달하고 미확인 통화는 비운다", async () => {
  const cases = [
    ["쿠팡", "https://www.coupang.com/vp/products/1", "12,000", "8,000", "8000"],
    ["무신사", "https://www.musinsa.com/products/2", "12,000", "", "12000"],
    ["29CM", "https://product.29cm.co.kr/catalog/3", "100", "0", "0"],
    ["지그재그", "https://zigzag.kr/catalog/products/4", "100", "-1", "100"],
    ["개별 판매자", "https://m.smartstore.naver.com/shop/products/5", "100", "1.5", "100"],
    ["KREAM", "https://kream.co.kr/products/6", "-1", "1.5", null],
    ["ABLY", "https://mobile.a-bly.com/goods/7", "100", "80", "80"],
    ["4910", "https://www.4910.kr/desktop/goods/8", "100", "80", "80"],
    ["무신사", "https://global.musinsa.com/products/9", "100", "80", "80"],
    ["쿠팡", "https://www.tw.coupang.com/products/10", "100", "80", "80"],
    ["쿠팡", "https://link.coupang.com/a/11", "100", "80", "80"],
    ["ABLY", "https://click.linkprice.com/click?url=https://a-bly.com", "100", "80", "80"],
    ["KREAM", "https://kream.co.kr.example.com/products/13", "100", "80", "80"],
    ["알리익스프레스", "https://aliexpress.com/item/14", "100", "80", null],
    ["", "https://WWW.MUSINSA.COM/products/15", "100", "80", "80"],
    ["무신사", "https://m.store.musinsa.com/app/goods/16", "100", "80", "80"],
    ["지그재그", "https://s.zigzag.kr/share/17", "100", "80", "80"],
    ["네이버 브랜드스토어", "https://m.brand.naver.com/shop/products/18", "100", "80", null],
    ["네이버 쇼핑", "https://m.shopping.naver.com/window/products/19", "100", "80", null],
    ["네이버 쇼핑", "https://msearch.shopping.naver.com/catalog/20", "100", "80", null],
    ["네이버", "https://m.shopping.naver.com.example.org/21", "100", "80", null],
    ["지그재그", "https://s.zigzag.kr.example.org/22", "100", "80", "80"],
    ["무신사", "https://global.store.musinsa.com/goods/23", "100", "80", "80"],
    ["  kReAm  ", "https://shop.test/24", "100", "80", "80"],
    ["네이버 스마트스토어", "https://shop.test/25", "100", "80", "80"],
    ["", "https://kream.co.kr.example.com/26", "100", "80", null],
    ["", "https://fakecoupang.com/27", "100", "80", null],
    ["", "https://a.custom.musinsa.com/28", "100", "80", "80"],
  ];
  for (const [store, host] of [
    ["쿠팡", "coupang.com"],
    ["무신사", "musinsa.com"],
    ["29CM", "29cm.co.kr"],
    ["지그재그", "zigzag.kr"],
    ["네이버 스마트스토어", "smartstore.naver.com"],
    ["KREAM", "kream.co.kr"],
    ["ABLY", "a-bly.com"],
    ["4910", "4910.kr"],
  ]) {
    cases.push([`  ${store.toLowerCase()}  `, `https://shop.test/${host}`, "100", "80", "80"]);
    cases.push(["미확인", `https://${host}/1`, "100", "80", "80"]);
    cases.push(["미확인", `https://custom.sub.${host}/2`, "100", "80", "80"]);
    cases.push(["미확인", `https://${host}.example.org/3`, "100", "80", null]);
  }
  const bytes = new TextEncoder().encode(
    Papa.unparse([
      domain.CSV_REQUIRED_HEADERS,
      ...cases.map(([store, url, regular, sale], index) => [
        `상품${index}`,
        store,
        "",
        regular,
        sale,
        "2026-10-12 09:00:00",
        "",
        "N",
        url,
      ]),
    ]),
  );
  const { run, calls } = setup({
    bytes,
    rpc: (_, attempt) =>
      attempt === 1
        ? { data: null, error: { code: "40001", message: "csv_folder_conflict" } }
        : {
            data: { importedCount: cases.length, excludedProducts: [], folderFailures: [] },
            error: null,
          },
  });
  const result = await run();
  assert.equal(result.importedCount, cases.length);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.import_plan.failures.length, 0);
    assert.deepEqual(
      call.import_plan.products.map((product) => product.price),
      cases.map((entry) => entry[4]),
    );
    assert.deepEqual(
      call.import_plan.products.map((product) => product.url),
      cases.map((entry) => entry[1]),
    );
  }
});

test("서버 응답을 받지 못하면 완료로 표시하지 않고 같은 파일 재시도에 요청 ID를 유지한다", async () => {
  const storage = new Map();
  const first = setup({
    storage,
    rpc: () => ({ data: null, error: { code: "NETWORK", message: "응답 유실" } }),
  });
  await assert.rejects(first.run);
  assert.equal(first.progress.length, 1);
  assert.equal(storage.size, 1);
  const retry = setup({ storage });
  await retry.run();
  assert.equal(retry.calls[0].request_id, first.calls[0].request_id);
  assert.equal(
    retry.calls[0].import_plan.products[0].savedAt,
    first.calls[0].import_plan.products[0].savedAt,
  );
  assert.equal(storage.size, 0);
});

test("서버가 동시 폴더 이름 충돌을 알리면 최신 폴더 목록으로 재계산한다", async () => {
  const { run, calls } = setup({
    folders: (attempt) => (attempt === 0 ? [] : ["abcdefg"]),
    rpc: (_, attempt) =>
      attempt === 1
        ? { data: null, error: { code: "40001", message: "csv_folder_conflict" } }
        : { data: { importedCount: 1, excludedProducts: [], folderFailures: [] }, error: null },
  });
  await run();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].request_id, calls[1].request_id);
  assert.equal(calls[0].import_plan.folderMappings[0].folderName, "abcdefg");
  assert.equal(calls[1].import_plan.folderMappings[0].folderName, "abcdef2");
});

test("폴더 한도로 제외된 원본도 서버에 전달하고 경고를 상품 실패로 바꾸지 않는다", async () => {
  const { run, calls } = setup({
    folders: Array.from({ length: 50 }, (_, i) => `폴더${i}`),
    rpc: () => ({
      data: {
        importedCount: 1,
        excludedProducts: [],
        folderFailures: [
          {
            rowNumber: 2,
            productName: "상품",
            sourceFolderName: "abcdefg-long",
            reason: "FOLDER_LIMIT_EXCEEDED",
          },
        ],
      },
      error: null,
    }),
  });
  let confirmed = 0;
  const result = await run(async () => {
    assert.equal(calls.length, 0);
    confirmed++;
    return true;
  });
  assert.equal(confirmed, 1);
  assert.deepEqual(calls[0].import_plan.products[0].folderNames, []);
  assert.deepEqual(calls[0].import_plan.products[0].sourceFolderNames, ["abcdefg-long"]);
  assert.equal(result.importedCount, 1);
  assert.equal(result.excludedProducts.length, 0);
  assert.equal(result.folderFailures.length, 1);
});

test("로그인 없음·5MB 초과·잘못된 인코딩·빈 CSV는 서버 저장을 호출하지 않는다", async () => {
  for (const [options, error] of [
    [{ user: null }, "login-required"],
    [{ bytes: new Uint8Array(domain.MAX_CSV_BYTES + 1) }, "file-too-large"],
    [{ bytes: new Uint8Array([0xff]) }, "invalid-encoding"],
    [
      { bytes: new TextEncoder().encode(Papa.unparse([domain.CSV_REQUIRED_HEADERS])) },
      "missing-product-info",
    ],
  ]) {
    const { run, calls } = setup(options);
    assert.equal((await run()).error, error);
    assert.equal(calls.length, 0);
  }
});

test("폴더 한도 확인을 취소하거나 확인 콜백이 없으면 저장하지 않는다", async () => {
  for (const confirm of [undefined, async () => false]) {
    const { run, calls, storage } = setup({
      folders: Array.from({ length: 50 }, (_, i) => `폴더${i}`),
    });
    assert.equal(await run(confirm), null);
    assert.equal(calls.length, 0);
    assert.equal(storage.size, 0);
  }
});

test("한도 이내이거나 기존 폴더를 재사용하면 한도 확인을 요청하지 않는다", async () => {
  for (const options of [
    { folders: Array.from({ length: 49 }, (_, i) => `폴더${i}`) },
    {
      folders: ["기존폴더", ...Array.from({ length: 49 }, (_, i) => `폴더${i}`)],
      sources: { 기존폴더: "abcdefg-long" },
    },
  ]) {
    const { run, calls } = setup(options);
    await run(async () => assert.fail("한도 안내가 필요하지 않음"));
    assert.equal(calls.length, 1);
  }
});

test("충돌 재시도 중 처음 한도를 넘으면 저장 전에 한 번만 확인한다", async () => {
  const { run, calls } = setup({
    folders: (attempt) => (attempt === 0 ? [] : Array.from({ length: 50 }, (_, i) => `폴더${i}`)),
    rpc: (_, attempt) =>
      attempt < 3
        ? { data: null, error: { code: "40001" } }
        : { data: { importedCount: 1, excludedProducts: [], folderFailures: [] }, error: null },
  });
  let confirmations = 0;
  await run(async () => {
    assert.equal(calls.length, 1);
    confirmations++;
    return true;
  });
  assert.equal(confirmations, 1);
  assert.equal(calls.length, 3);
});

test("가져오기 시작·완료 이벤트를 같은 작업 ID로 보내고 결과 수를 나눠 담는다", async () => {
  analyticsEvents.length = 0;
  const excluded = (kind) => ({ productName: "상품", reason: "INVALID_PRODUCT_DATA", kind });
  const { run, calls } = setup({
    folders: ["abcdefg"],
    rpc: async () => ({
      data: {
        importedCount: 1,
        excludedProducts: [excluded("duplicate"), excluded("failed"), excluded("failed")],
        folderFailures: [],
      },
      error: null,
    }),
  });
  await run();
  const jobId = calls[0].request_id;
  assert.deepEqual(JSON.parse(JSON.stringify(analyticsEvents)), [
    ["wishlist_import_start", { import_job_id: jobId }],
    [
      "wishlist_import_complete",
      {
        import_job_id: jobId,
        total_count: 1,
        success_count: 1,
        duplicate_count: 1,
        fail_count: 2,
      },
    ],
  ]);
});
