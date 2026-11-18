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

function loadAnalytics({ consent = { usage_analysis: true, overseas_transfer: true } } = {}) {
  const instances = [];
  const removed = [];
  let rpcResult = { data: consent, error: null };
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "..", "src/lib/analytics.ts"), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      module,
      exports: module.exports,
      setTimeout,
      process: { env: { EXPO_PUBLIC_AMPLITUDE_API_KEY: "1234567890-key" } },
      require: (name) => {
        if (name === "@amplitude/analytics-react-native")
          return {
            createInstance: () => {
              const instance = {
                calls: [],
                init: (key, userId, options) => instance.calls.push(["init", userId, options]),
                setUserId: (userId) => instance.calls.push(["setUserId", userId]),
                track: (eventName) => instance.calls.push(["track", eventName]),
                setOptOut: (value) => instance.calls.push(["setOptOut", value]),
                reset: () => instance.calls.push(["reset"]),
                remove: (pluginName) => instance.calls.push(["remove", pluginName]),
              };
              instances.push(instance);
              return instance;
            },
          };
        if (name === "@react-native-async-storage/async-storage")
          return { __esModule: true, default: { removeItem: async (key) => removed.push(key) } };
        if (name === "@/lib/supabase") return { supabase: { rpc: async () => rpcResult } };
        return require(name);
      },
    },
  );
  return {
    analytics: module.exports,
    instances,
    removed,
    setRpc: (value) => (rpcResult = value),
  };
}

test("Amplitude는 개인정보처리방침에 없는 IP·위치·광고 식별자·IDFV·앱 세트 ID를 보내지 않는다", async () => {
  const { analytics, instances } = loadAnalytics();
  await analytics.syncAnalyticsConsent("u1");
  const { trackingOptions } = instances[0].calls[0][2];
  for (const key of ["ipAddress", "adid", "idfv", "appSetId", "country"])
    assert.equal(trackingOptions[key], false, key);
});

test("두 선택 동의를 모두 한 회원만 Amplitude를 켜고, 비회원·한 항목 동의·조회 실패는 켜지 않는다", async () => {
  for (const [consent, userId] of [
    [{ usage_analysis: true, overseas_transfer: false }, "u1"],
    [{ usage_analysis: false, overseas_transfer: true }, "u1"],
    [{ usage_analysis: true, overseas_transfer: true }, null],
  ]) {
    const { analytics, instances } = loadAnalytics({ consent });
    await analytics.syncAnalyticsConsent(userId);
    analytics.trackEvent("community_view", { view_type: "feed" });
    assert.equal(instances.length, 0, JSON.stringify([consent, userId]));
  }
  const failed = loadAnalytics();
  failed.setRpc({ data: null, error: { message: "offline" } });
  await failed.analytics.syncAnalyticsConsent("u1");
  assert.equal(failed.instances.length, 0, "동의를 확인하지 못하면 켜지 않는다");

  const { analytics, instances } = loadAnalytics();
  await analytics.syncAnalyticsConsent("u1");
  analytics.trackEvent("community_view", { view_type: "feed" });
  assert.deepEqual(
    instances[0].calls.map(([name, value]) => [name, value]),
    [
      ["init", "u1"],
      ["track", "community_view"],
    ],
  );
});

test("철회하면 바로 멈추고 쌓인 이벤트를 지우며, 다시 동의하면 새로 시작한다", async () => {
  const { analytics, instances, removed } = loadAnalytics();
  await analytics.syncAnalyticsConsent("u1");
  analytics.applyAnalyticsConsent("u1", { usage_analysis: false, overseas_transfer: true });
  analytics.trackEvent("community_view", { view_type: "feed" });
  assert.deepEqual(
    instances[0].calls.slice(1).map(([name, value]) => [name, value]),
    [
      ["setOptOut", true],
      ["reset", undefined],
      ["remove", "amplitude"],
    ],
    "철회 뒤 이벤트는 보내지 않는다",
  );
  assert.deepEqual(removed, ["AMP_unsent_1234567890"]);
  analytics.applyAnalyticsConsent("u1", { usage_analysis: true, overseas_transfer: true });
  assert.equal(instances.length, 2, "다시 동의하면 새 인스턴스로 시작한다");
});

test("동의 확인이 늦게 끝나도 그 사이 로그아웃했으면 켜지 않는다", async () => {
  const { analytics, instances } = loadAnalytics();
  const pending = analytics.syncAnalyticsConsent("u1");
  await analytics.syncAnalyticsConsent(null);
  await pending;
  assert.equal(instances.length, 0);
});
