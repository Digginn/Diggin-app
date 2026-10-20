const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function loadPush({ os = "ios", status = "undetermined", requestResult = "granted" } = {}) {
  const calls = { requests: 0, tokens: 0, channels: 0, rpc: [], deleted: [] };
  const state = { status };
  const compiled = ts.transpileModule(
    readFileSync(path.join(__dirname, "../src/lib/pushNotifications.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
  ).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    console,
    require: (name) => {
      if (name === "react-native") return { Platform: { OS: os } };
      if (name === "expo-constants")
        return {
          __esModule: true,
          default: { expoConfig: { extra: { eas: { projectId: "project" } } } },
        };
      if (name === "expo-notifications")
        return {
          AndroidImportance: { DEFAULT: 3 },
          setNotificationChannelAsync: async () => {
            calls.channels += 1;
          },
          getPermissionsAsync: async () => ({ status: state.status }),
          requestPermissionsAsync: async () => {
            calls.requests += 1;
            state.status = requestResult;
            return { status: requestResult };
          },
          getExpoPushTokenAsync: async ({ projectId }) => {
            calls.tokens += 1;
            assert.equal(projectId, "project");
            return { data: "ExponentPushToken[device]" };
          },
        };
      if (name === "@/lib/supabase")
        return {
          supabase: {
            rpc: async (fn, args) => {
              calls.rpc.push([fn, args]);
              return { error: null };
            },
            from: (table) => ({
              delete: () => ({
                eq: async (column, value) => {
                  calls.deleted.push([table, column, value]);
                  return { error: null };
                },
              }),
            }),
          },
        };
      return require(name);
    },
  });
  return { push: module.exports, calls, state };
}

test("권한이 정해지지 않았을 때만 OS 권한 창을 띄우고, 허용되면 토큰을 등록한다", async () => {
  const { push, calls } = loadPush();
  await push.registerDevicePush("user-a", true);
  assert.equal(calls.requests, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.rpc)), [
    ["register_push_token", { new_token: "ExponentPushToken[device]", new_platform: "ios" }],
  ]);

  await push.registerDevicePush("user-a", true);
  assert.equal(calls.rpc.length, 1, "같은 계정이면 다시 등록하지 않는다");
  await push.registerDevicePush("user-b", true);
  assert.equal(calls.rpc.length, 2, "계정이 바뀌면 다시 등록해 토큰을 새 계정으로 옮긴다");
  assert.equal(calls.requests, 1, "이미 허용했으면 다시 묻지 않는다");
});

test("거부했거나 앱 복귀 때 확인하는 경우에는 권한 창을 띄우지 않고 등록도 하지 않는다", async () => {
  const denied = loadPush({ status: "denied" });
  await denied.push.registerDevicePush("user-a", true);
  assert.equal(denied.calls.requests, 0);
  assert.equal(denied.calls.tokens, 0);

  const later = loadPush();
  await later.push.registerDevicePush("user-a", false);
  assert.equal(later.calls.requests, 0, "앱 복귀 때는 묻지 않는다");
  assert.equal(later.calls.rpc.length, 0);

  // 설정에서 알림을 켜고 돌아오면 그때 등록한다.
  later.state.status = "granted";
  await later.push.registerDevicePush("user-a", false);
  assert.equal(later.calls.rpc.length, 1);
});

test("안드로이드는 권한을 묻기 전에 알림 채널을 만든다", async () => {
  const { push, calls } = loadPush({ os: "android" });
  await push.registerDevicePush("user-a", true);
  assert.equal(calls.channels, 1);
  assert.equal(calls.rpc[0][1].new_platform, "android");
});

test("로그아웃하면 이 기기에 등록한 토큰만 지우고, 등록한 적 없으면 아무것도 하지 않는다", async () => {
  const { push, calls } = loadPush();
  await push.unregisterDevicePush();
  assert.equal(calls.deleted.length, 0);

  await push.registerDevicePush("user-a", true);
  await push.unregisterDevicePush();
  assert.deepEqual(calls.deleted, [["push_tokens", "token", "ExponentPushToken[device]"]]);
  await push.registerDevicePush("user-a", true);
  assert.equal(calls.rpc.length, 2, "로그아웃 뒤 같은 계정으로 다시 로그인하면 다시 등록한다");
});
