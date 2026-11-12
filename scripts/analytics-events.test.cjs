/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(file, mocks) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "..", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { module, exports: module.exports, require: (name) => mocks[name] ?? require(name) },
  );
  return module.exports;
}

function setup(file, extra = {}) {
  const events = [];
  let mutation;
  const exports = load(file, {
    "@tanstack/react-query": {
      useMutation: (options) => (mutation = options),
      useQueryClient: () => ({ invalidateQueries: async () => {} }),
    },
    "@/lib/analytics": { trackEvent: (name, properties) => events.push([name, properties]) },
    "@/api/folders": { folderKeys: { all: ["folders"] } },
    "@/api/products": { productKeys: { all: ["products"] } },
    ...extra,
  });
  return { exports, events, mutation: () => mutation };
}

test("한 번에 지운 상품은 상품마다 같은 delete_batch_id로 보낸다", async () => {
  let count = 0;
  const { exports, events, mutation } = setup("src/screens/all/mutations/useDeleteProducts.ts", {
    "expo-crypto": { randomUUID: () => `batch-${++count}` },
  });
  exports.useDeleteProducts();
  await mutation().onSuccess(undefined, ["1", "2"]);
  await mutation().onSuccess(undefined, ["3"]);
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [
    ["product_delete", { product_id: "1", delete_batch_id: "batch-1" }],
    ["product_delete", { product_id: "2", delete_batch_id: "batch-1" }],
    ["product_delete", { product_id: "3", delete_batch_id: "batch-2" }],
  ]);
});

test("저장 시작 경로를 완료 이벤트까지 이어 보내고 중복 저장은 완료로 보내지 않는다", async () => {
  const React = require("react");
  const { exports, events, mutation } = setup("src/hooks/useItemSave.ts", {
    "react": {
      ...React,
      useState: (initial) => [initial, () => {}],
      useCallback: (callback) => callback,
      useRef: (() => {
        const ref = { current: undefined };
        return (initial) => {
          ref.current ??= initial;
          return ref;
        };
      })(),
    },
    "react-native": { AppState: {}, Platform: { OS: "android" } },
    "@/hooks/useDetectedLink": { markLinkHandled: () => {} },
    "@/screens/save/domain/normalizeProductPage": {},
  });
  const itemSave = exports.useItemSave();
  itemSave.start("https://shop.test/a", "share");
  await mutation().onSuccess({ isDuplicate: true });
  await mutation().onSuccess({ isDuplicate: false });
  itemSave.start("https://shop.test/b");
  await mutation().onSuccess({ isDuplicate: false });
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [
    ["product_add_start", { entry_point: "share" }],
    ["product_add_complete", { entry_point: "share" }],
    ["product_add_start", { entry_point: "direct" }],
    ["product_add_complete", { entry_point: "direct" }],
  ]);
});
