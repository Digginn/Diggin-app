/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(file, mocks, globals = {}) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "..", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      console,
      ...globals,
      require: (name) => (name in mocks ? mocks[name] : require(name)),
    },
  );
  return module.exports;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("공유 확장 제외 목록은 문자열만 사용하고 알림 채널 옵션은 루트 플러그인에 둔다", () => {
  const { plugins } = JSON.parse(readFileSync(path.join(__dirname, "../app.json"), "utf8")).expo;
  const extension = plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-share-extension",
  );
  assert.equal(
    extension[1].excludedPackages.every((name) => typeof name === "string"),
    true,
  );
  assert.equal(extension[1].excludedPackages.includes("expo-notifications"), true);
  const notifications = plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-notifications",
  );
  assert.equal(notifications[1].defaultChannel, "default");
});

const response = (data, id = "push-1", actionIdentifier = "default") => ({
  actionIdentifier,
  notification: { request: { identifier: id, content: { data } } },
});
const payload = { recipient_id: "user-a", post_id: "123", post_type: "post" };
function setup({
  os = "android",
  userId = "user-a",
  restoring = false,
  last = null,
  lastGate,
} = {}) {
  const calls = { routes: [], cleared: 0, invalidated: 0, removed: 0, handler: null };
  let cleanup, pressed, received;
  const { PushNotifications } = load("src/components/PushNotifications.tsx", {
    "react": {
      useRef: (current) => ({ current }),
      useEffect: (effect) => {
        cleanup = effect();
      },
    },
    "react-native": { Platform: { OS: os } },
    "@tanstack/react-query": {
      useQueryClient: () => ({
        invalidateQueries: async () => {
          calls.invalidated++;
        },
      }),
    },
    "expo-router": { useRouter: () => ({ push: (value) => calls.routes.push(value) }) },
    "@/contexts/AuthContext": {
      useAuth: () => ({
        session: userId ? { user: { id: userId } } : null,
        isRestoring: restoring,
      }),
    },
    "@/screens/notification/api/notifications": { notificationKeys: { all: ["notifications"] } },
    "expo-notifications": {
      DEFAULT_ACTION_IDENTIFIER: "default",
      setNotificationHandler: (handler) => {
        calls.handler = handler;
      },
      clearLastNotificationResponseAsync: async () => {
        calls.cleared++;
      },
      getLastNotificationResponseAsync: async () => {
        await lastGate;
        return last;
      },
      addNotificationResponseReceivedListener: (callback) => {
        pressed = callback;
        return { remove: () => calls.removed++ };
      },
      addNotificationReceivedListener: (callback) => {
        received = callback;
        return { remove: () => calls.removed++ };
      },
    },
  });
  PushNotifications();
  return {
    calls,
    press: (value) => pressed?.(value),
    receive: () => received?.(),
    stop: () => cleanup?.(),
  };
}

test("Android 종료 상태 알림과 실행 중 선택을 연결하고 같은 선택은 한 번만 처리한다", async () => {
  const cold = response(payload);
  const h = setup({ last: cold });
  await tick();
  assert.equal(h.calls.routes[0].pathname, "/posts/[id]");
  assert.equal(h.calls.routes[0].params.id, "123");
  h.press(cold);
  assert.equal(h.calls.routes.length, 1);
  h.press(response({ ...payload, post_type: "vote", post_id: "9007199254740993" }, "push-2"));
  assert.equal(h.calls.routes[1].pathname, "/votes/[id]");
  assert.equal(h.calls.routes[1].params.id, "9007199254740993", "큰 ID를 Number로 바꾸지 않는다");
  assert.equal(h.calls.cleared, 2);
});

test("다른 계정 알림은 무시하고 비회원·알 수 없는 payload는 알림 목록으로 보낸다", () => {
  const other = setup({ userId: "user-b" });
  other.press(response(payload));
  assert.deepEqual(other.calls.routes, []);
  const guest = setup({ userId: null });
  guest.press(response(payload));
  assert.deepEqual(guest.calls.routes, ["/notifications"]);
  const malformed = setup();
  malformed.press(response({ url: "https://evil.example", post_id: "1x" }));
  assert.deepEqual(malformed.calls.routes, ["/notifications"]);
  malformed.press(response(payload, "custom", "dismiss"));
  assert.equal(malformed.calls.routes.length, 1);
  malformed.press(response(undefined, "no-data"));
  assert.deepEqual(malformed.calls.routes, ["/notifications", "/notifications"]);
});

test("로그아웃·화면 정리 뒤 도착하는 초기 응답은 이동하지 않고 리스너를 해제한다", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const h = setup({ last: response(payload), lastGate: gate });
  h.stop();
  release();
  await tick();
  h.press(response(payload));
  assert.deepEqual(h.calls.routes, []);
  assert.equal(h.calls.removed, 2);
  assert.equal(h.calls.handler, null);
});

test("실행 중 수신은 목록을 갱신하고 내 알림은 OS 배너·소리·목록으로도 띄운다", async () => {
  const h = setup();
  h.receive();
  assert.equal(h.calls.invalidated, 1);
  const own = await h.calls.handler.handleNotification(response(payload).notification);
  assert.equal(own.shouldShowBanner, true);
  assert.equal(own.shouldShowList, true);
  assert.equal(own.shouldPlaySound, true);
  assert.equal(own.shouldSetBadge, false);
  const other = await h.calls.handler.handleNotification(
    response({ ...payload, recipient_id: "other" }).notification,
  );
  assert.equal(other.shouldShowBanner, false);
  assert.equal(other.shouldPlaySound, false);
  const guest = setup({ userId: null });
  assert.equal(
    (await guest.calls.handler.handleNotification(response(payload).notification)).shouldShowBanner,
    false,
  );
});

test("iOS도 초기 알림·탭 이동·실행 중 갱신을 처리하고 내 알림은 앱 사용 중에도 띄운다", async () => {
  const cold = response(payload);
  const h = setup({ os: "ios", last: cold });
  await tick();
  assert.equal(h.calls.routes[0].pathname, "/posts/[id]");
  h.press(cold);
  assert.equal(h.calls.routes.length, 1);
  h.press(response({ ...payload, post_type: "vote" }, "vote-ios"));
  assert.equal(h.calls.routes[1].pathname, "/votes/[id]");
  h.receive();
  assert.equal(h.calls.invalidated, 1);
  const display = await h.calls.handler.handleNotification(cold.notification);
  assert.equal(display.shouldShowBanner, true);
  assert.equal(display.shouldShowList, true);
  assert.equal(display.shouldPlaySound, true);
  h.stop();
  assert.equal(h.calls.removed, 2);
  assert.equal(h.calls.handler, null);
});

test("인증 복원 중에는 초기 알림을 소비하지 않고 웹에는 리스너를 연결하지 않는다", () => {
  for (const options of [{ restoring: true }, { os: "web" }]) {
    const h = setup(options);
    assert.equal(h.calls.handler, null);
    h.press(response(payload));
    assert.deepEqual(h.calls.routes, []);
  }
});

function config(env = {}, hasLocal = false, android = { package: "com.diggin.app" }) {
  const { default: configure } = load(
    "app.config.ts",
    { "node:fs": { existsSync: () => hasLocal } },
    {
      process: { env },
      console: { warn() {} },
    },
  );
  return configure({ config: { name: "Diggin", slug: "Diggin", android, plugins: [] } });
}

test("Firebase 파일은 EAS 환경변수·기존 설정·로컬 파일 순서로 연결하며 iOS 설정을 유지한다", () => {
  assert.equal(
    config({ GOOGLE_SERVICES_JSON: "/eas/file" }).android.googleServicesFile,
    "/eas/file",
  );
  assert.equal(
    config({}, false, { googleServicesFile: "./custom.json" }).android.googleServicesFile,
    "./custom.json",
  );
  assert.equal(config({}, true).android.googleServicesFile, "./google-services.json");
  assert.equal(config().ios.bundleIdentifier, "com.diggin.app.preview");
  assert.equal(config().android.googleServicesFile, undefined);
});

test("Firebase 설정 없는 Android 운영 빌드는 차단하고 iOS 빌드에는 요구하지 않는다", () => {
  assert.throws(
    () => config({ EAS_BUILD_PLATFORM: "android", EAS_BUILD_PROFILE: "production" }),
    /GOOGLE_SERVICES_JSON/,
  );
  assert.equal(
    config({ EAS_BUILD_PLATFORM: "ios", EAS_BUILD_PROFILE: "production" }).ios.bundleIdentifier,
    "com.diggin.app.preview",
  );
});
