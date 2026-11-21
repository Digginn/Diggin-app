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

function loadAnalytics({
  consent = { usage_analysis: true, overseas_transfer: true },
  makeTimeline,
  makeClient,
  storage,
} = {}) {
  const instances = [];
  const removed = [];
  const transported = [];
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
      clearTimeout,
      process: { env: { EXPO_PUBLIC_AMPLITUDE_API_KEY: "1234567890-key" } },
      require: (name) => {
        if (name === "@amplitude/analytics-react-native")
          return {
            createInstance: () => {
              if (makeClient) {
                const instance = makeClient();
                instances.push(instance);
                return instance;
              }
              const instance = {
                timeline: makeTimeline ? makeTimeline() : undefined,
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
          return {
            __esModule: true,
            default: storage ?? { removeItem: async (key) => removed.push(key) },
          };
        if (name === "@amplitude/analytics-core")
          return {
            FetchTransport: class {
              async send(url, payload) {
                transported.push(payload);
                return null;
              }
            },
          };
        if (name === "@/lib/supabase") return { supabase: { rpc: async () => rpcResult } };
        return require(name);
      },
    },
  );
  return {
    analytics: module.exports,
    instances,
    removed,
    transported,
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

test("SDK가 저장 이벤트를 읽는 중 철회·로그아웃하면 늦게 읽힌 이벤트도 전송하지 않는다", async () => {
  const { AmplitudeCore, Destination, Logger } = require("@amplitude/analytics-core");
  for (const action of ["withdraw", "logout"]) {
    const records = new Map([
      ["AMP_unsent_1234567890", [{ event_type: "prior_session_event", user_id: "u1" }]],
    ]);
    let finishRead, startRead, initialized, destination;
    const reading = new Promise((resolve) => (startRead = resolve));
    const storage = {
      getItem: async (key) => {
        const snapshot = JSON.stringify(records.get(key) ?? null);
        if (key === "AMP_unsent_1234567890") {
          startRead();
          await new Promise((resolve) => (finishRead = resolve));
        }
        return snapshot;
      },
      setItem: async (key, value) => records.set(key, JSON.parse(value)),
      removeItem: async (key) => records.delete(key),
    };
    const core = new AmplitudeCore();
    const { analytics, transported } = loadAnalytics({
      storage,
      makeClient: () => ({
        timeline: core.timeline,
        init(apiKey, userId, options) {
          const config = {
            ...options,
            apiKey,
            userId,
            flushIntervalMillis: 10,
            flushQueueSize: 30,
            loggerProvider: new Logger(),
            transportProvider: options.transportProvider ?? {
              send: async (url, payload) => (transported.push(payload), null),
            },
            storageProvider: options.storageProvider ?? {
              get: async (key) => JSON.parse(await storage.getItem(key)),
              set: async (key, value) => storage.setItem(key, JSON.stringify(value)),
            },
          };
          initialized = (async () => {
            await core._init(config);
            destination = new Destination();
            await core.add(destination).promise;
          })();
          return { promise: initialized };
        },
        setOptOut: (value) => core.setOptOut(value),
        reset: () => {},
        remove: (name) => core.remove(name),
      }),
    });
    await analytics.syncAnalyticsConsent("u1");
    await reading;
    assert.equal(
      core.timeline.plugins.length,
      0,
      "setup 중에는 전송 플러그인이 아직 등록되지 않는다",
    );
    if (action === "withdraw") {
      analytics.applyAnalyticsConsent("u1", { usage_analysis: false, overseas_transfer: true });
    } else {
      await analytics.syncAnalyticsConsent(null);
    }
    finishRead();
    await initialized;
    // 실제 SDK의 예약 시각을 기다리지 않고 같은 flush 경로를 실행한다.
    if (destination.scheduleId) clearTimeout(destination.scheduleId);
    destination.resetSchedule();
    await destination.flush();
    assert.deepEqual(transported, [], `${action}: 초기화가 늦게 끝나도 전송하면 안 된다`);
    assert.equal(destination.queue.length, 0, `${action}: 철회 전 이벤트를 다시 쌓으면 안 된다`);
    assert.equal(records.has("AMP_unsent_1234567890"), false);
  }
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

test("설정에서 바꾼 동의는 그 전에 시작한 조회 결과로 덮이지 않는다", async () => {
  const { analytics, instances, setRpc } = loadAnalytics();
  setRpc({ data: { usage_analysis: false, overseas_transfer: false }, error: null });
  const stale = analytics.syncAnalyticsConsent("u1");
  analytics.applyAnalyticsConsent("u1", { usage_analysis: true, overseas_transfer: true });
  await stale;
  analytics.trackEvent("community_view", { view_type: "feed" });
  assert.equal(instances.length, 1);
  assert.equal(instances[0].calls.at(-1)[0], "track", "늦게 끝난 조회가 전송을 멈추지 않는다");
});

test("철회하면 이미 예약된 전송과 메모리 대기열도 비워 SDK 전송 플러그인이 보내지 않는다", async () => {
  const { Destination, Logger } = require("@amplitude/analytics-core");
  const sent = [];
  const stored = new Map();
  const destination = new Destination();
  await destination.setup({
    apiKey: "1234567890-key",
    flushIntervalMillis: 20,
    flushQueueSize: 30,
    flushMaxRetries: 5,
    serverUrl: "https://api2.amplitude.com/2/httpapi",
    loggerProvider: new Logger(),
    transportProvider: {
      send: async (url, payload) => (
        sent.push(payload),
        { status: "Success", statusCode: 200, body: {} }
      ),
    },
    storageProvider: {
      get: async (key) => stored.get(key),
      set: async (key, value) => stored.set(key, value),
      remove: async (key) => stored.delete(key),
    },
  });
  const { analytics } = loadAnalytics({
    makeTimeline: () => ({ queue: [], plugins: [destination] }),
  });
  await analytics.syncAnalyticsConsent("u1");
  void destination.execute({ event_type: "community_view" });
  assert.equal(destination.queue.length, 1, "전송이 예약된 상태");
  analytics.applyAnalyticsConsent("u1", { usage_analysis: false, overseas_transfer: true });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(sent, [], "예약 시각이 지나도 보내지 않는다");
  assert.equal(destination.queue.length, 0);
  assert.equal(stored.get("AMP_unsent_1234567890").length, 0, "저장소의 미전송 목록도 비운다");
});

test("다시 동의하면 저장된 optOut을 풀고 시작한다", async () => {
  const { analytics, instances } = loadAnalytics();
  await analytics.syncAnalyticsConsent("u1");
  assert.equal(instances[0].calls[0][2].optOut, false);
});

test("철회한 인스턴스의 늦은 전송은 재동의 뒤에도 차단하고 새 인스턴스만 전송한다", async () => {
  const { analytics, instances, transported } = loadAnalytics();
  await analytics.syncAnalyticsConsent("u1");
  const previous = instances[0].calls[0][2].transportProvider;
  const url = "https://api2.amplitude.com/2/httpapi";
  const payload = { events: [{ event_type: "community_view" }] };
  await previous.send(url, payload);
  assert.equal(transported.length, 1, "동의한 활성 인스턴스는 기본 전송으로 넘긴다");
  analytics.applyAnalyticsConsent("u1", { usage_analysis: false, overseas_transfer: true });
  await previous.send(url, payload);
  assert.equal(transported.length, 1, "철회 직후의 늦은 전송은 차단한다");
  analytics.applyAnalyticsConsent("u1", { usage_analysis: true, overseas_transfer: true });
  await previous.send(url, payload);
  assert.equal(transported.length, 1, "재동의해도 이전 인스턴스는 다시 허용하지 않는다");
  await instances[1].calls[0][2].transportProvider.send(url, payload);
  assert.equal(transported.length, 2, "재동의한 새 인스턴스는 정상 전송한다");
});

test("이전 계정의 늦은 동의 저장 응답은 분석을 켜거나 사용자를 바꾸지 않는다", async () => {
  const loggedOut = loadAnalytics({ consent: { usage_analysis: false, overseas_transfer: false } });
  await loggedOut.analytics.syncAnalyticsConsent("A");
  await loggedOut.analytics.syncAnalyticsConsent(null);
  loggedOut.analytics.applyAnalyticsConsent("A", { usage_analysis: true, overseas_transfer: true });
  assert.equal(loggedOut.instances.length, 0, "로그아웃 뒤 A의 응답으로 켜지지 않는다");

  const switched = loadAnalytics();
  await switched.analytics.syncAnalyticsConsent("B");
  switched.analytics.applyAnalyticsConsent("A", { usage_analysis: true, overseas_transfer: true });
  assert.ok(
    !switched.instances[0].calls.some(([name, value]) => name === "setUserId" && value === "A"),
    "B로 바뀐 뒤 A의 응답이 사용자를 A로 바꾸지 않는다",
  );
});
