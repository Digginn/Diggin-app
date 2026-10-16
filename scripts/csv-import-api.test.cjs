/* global __dirname */
const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const Papa = require("papaparse");
const ts = require("typescript");

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
      require: (name) => overrides[name] ?? require(name),
    },
  );
  return module.exports;
}

const domain = load("../src/screens/my/domain/prepareCsvImport.ts");
function setup({ folders = [], rpc, storage = new Map(), user = { id: "user-a" }, bytes } = {}) {
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
    "@/lib/supabase": {
      supabase: {
        auth: { getUser: async () => ({ data: { user }, error: null }) },
        from: (table) => {
          assert.equal(table, "folders");
          const filters = [];
          const query = {
            select: () => query,
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
              return resolve({ data: names.map((name) => ({ name })), error: null });
            },
          };
          return query;
        },
        rpc: async (name, payload) => {
          assert.equal(name, "import_csv");
          const copy = JSON.parse(JSON.stringify(payload));
          calls.push(copy);
          return rpc
            ? rpc(copy, calls.length)
            : { data: { importedCount: 1, excludedProducts: [], folderFailures: [] }, error: null };
        },
      },
    },
  });
  const run = () =>
    api.importCsv({ name: "wishlist.csv", uri: "file:///wishlist.csv" }, (value) =>
      progress.push(JSON.parse(JSON.stringify(value))),
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
  const result = await run();
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
