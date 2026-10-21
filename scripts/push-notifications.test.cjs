const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function loadPush({
  os = "ios",
  status = "undetermined",
  requestResult = "granted",
  tokenGate,
  rpcGate,
  rpcGates = [],
} = {}) {
  const calls = { requests: 0, tokens: 0, channels: 0, rpc: [], deleted: [], events: [] };
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
            await tokenGate;
            return { data: "ExponentPushToken[device]" };
          },
        };
      if (name === "@/lib/supabase")
        return {
          supabase: {
            rpc: async (fn, args) => {
              const index = calls.rpc.push([fn, args]);
              await (rpcGates[index - 1] ?? rpcGate);
              calls.events.push(`rpc${index}`);
              return { error: null };
            },
            from: (table) => ({
              delete: () => ({
                eq: async (column, value) => {
                  calls.deleted.push([table, column, value]);
                  calls.events.push("delete");
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
  push.finishDeviceSignOut();
  assert.equal(calls.deleted.length, 0);

  await push.registerDevicePush("user-a", true);
  await push.unregisterDevicePush();
  assert.deepEqual(calls.deleted, [["push_tokens", "token", "ExponentPushToken[device]"]]);
  push.finishDeviceSignOut();
  await push.registerDevicePush("user-a", true);
  assert.equal(calls.rpc.length, 2, "로그아웃 뒤 같은 계정으로 다시 로그인하면 다시 등록한다");
});

test("토큰을 받거나 등록 응답을 기다리는 중에 로그아웃해도 로그아웃한 계정의 토큰을 남기지 않는다", async () => {
  let releaseRpc;
  const slowRpc = loadPush({ rpcGate: new Promise((resolve) => (releaseRpc = resolve)) });
  const registering = slowRpc.push.registerDevicePush("user-a", true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(slowRpc.calls.rpc.length, 1, "등록 요청을 보낸 상태");
  const loggingOut = slowRpc.push.unregisterDevicePush();
  releaseRpc();
  await Promise.all([registering, loggingOut]);
  assert.deepEqual(
    slowRpc.calls.deleted,
    [["push_tokens", "token", "ExponentPushToken[device]"]],
    "응답을 기다렸다가 방금 등록한 토큰을 지운다",
  );

  let releaseToken;
  const slowToken = loadPush({ tokenGate: new Promise((resolve) => (releaseToken = resolve)) });
  const waitingToken = slowToken.push.registerDevicePush("user-a", true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await slowToken.push.unregisterDevicePush();
  releaseToken();
  await waitingToken;
  assert.equal(slowToken.calls.rpc.length, 0, "로그아웃한 뒤 받은 토큰은 등록하지 않는다");
  assert.equal(slowToken.calls.deleted.length, 0);
});

test("등록 요청이 겹친 채 로그아웃하면 모든 등록 응답이 끝난 뒤에 토큰을 지운다", async () => {
  const release = [];
  const gates = [0, 1].map(() => new Promise((resolve) => release.push(resolve)));
  const { push, calls } = loadPush({ status: "granted", rpcGates: gates });
  const first = push.registerDevicePush("user-a", true);
  const second = push.registerDevicePush("user-a", false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.rpc.length, 2, "로그인 직후와 앱 복귀가 겹쳐 등록 요청이 두 번 나간 상태");
  release[1]();
  await second;
  const loggingOut = push.unregisterDevicePush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  release[0]();
  await Promise.all([first, loggingOut]);
  assert.deepEqual(
    calls.events,
    ["rpc2", "rpc1", "delete"],
    "늦게 끝난 첫 요청이 저장한 뒤에 지운다",
  );
  assert.deepEqual(calls.deleted, [["push_tokens", "token", "ExponentPushToken[device]"]]);
});

test("로그아웃이 끝날 때까지는 앱 복귀로 새 등록이 시작되지 않는다", async () => {
  let releaseFirst;
  const { push, calls } = loadPush({
    status: "granted",
    rpcGates: [new Promise((resolve) => (releaseFirst = resolve))],
  });
  const first = push.registerDevicePush("user-a", true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const loggingOut = push.unregisterDevicePush();
  await push.registerDevicePush("user-a", false);
  assert.equal(
    calls.rpc.length,
    1,
    "처리 중인 등록을 기다리는 동안 앱으로 돌아와도 새 등록을 보내지 않는다",
  );
  releaseFirst();
  await Promise.all([first, loggingOut]);
  await push.registerDevicePush("user-a", false);
  assert.equal(calls.rpc.length, 1, "토큰을 지운 뒤 세션 종료 전에도 새 등록을 보내지 않는다");
  assert.deepEqual(calls.events, ["rpc1", "delete"]);

  push.finishDeviceSignOut();
  await push.registerDevicePush("user-a", false);
  assert.equal(
    calls.rpc.length,
    2,
    "로그아웃이 끝나면(실패해 로그인 상태가 남은 경우 포함) 다시 등록할 수 있다",
  );
});

test("로그아웃이 겹치면 모두 끝난 뒤에야 등록을 다시 허용한다", async () => {
  const { push, calls } = loadPush({ status: "granted" });
  await Promise.all([push.unregisterDevicePush(), push.unregisterDevicePush()]);
  push.finishDeviceSignOut();
  await push.registerDevicePush("user-a", false);
  assert.equal(calls.rpc.length, 0, "한쪽만 끝났으면 아직 막는다");
  push.finishDeviceSignOut();
  await push.registerDevicePush("user-a", false);
  assert.equal(calls.rpc.length, 1);
});
