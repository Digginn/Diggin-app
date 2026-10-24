/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function setup(props = {}) {
  const states = [],
    refs = [],
    toasts = [];
  let cursor = 0,
    refCursor = 0,
    cleanup;
  const screen = { exports: {} };
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        path.join(__dirname, "../src/screens/my/NotificationSettingsScreen.tsx"),
        "utf8",
      ),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      },
    ).outputText,
    {
      module: screen,
      exports: screen.exports,
      require: (name) => {
        if (name === "react")
          return {
            ...React,
            useState: (initial) => {
              const index = cursor++;
              if (!(index in states)) states[index] = initial;
              return [
                states[index],
                (value) => {
                  states[index] = value;
                },
              ];
            },
            useRef: (initial) => refs[refCursor++] ?? (refs[refCursor - 1] = { current: initial }),
            useEffect: (effect) => {
              if (!cleanup) cleanup = effect();
            },
          };
        if (name === "react-native")
          return { View: "View", Text: "Text", ScrollView: "ScrollView" };
        if (name === "expo-status-bar") return { StatusBar: "StatusBar" };
        if (name === "react-native-safe-area-context")
          return { useSafeAreaInsets: () => ({ bottom: 34 }) };
        if (name === "@/components/app-bar") return { AppBar: "AppBar" };
        if (name === "@/components/Toggle") return { Toggle: "Toggle" };
        if (name === "@/screens/notification/components/PushOffBanner")
          return { PushOffBanner: "PushOffBanner" };
        if (name === "@/hooks/useToast")
          return {
            useToast:
              () =>
              (...args) =>
                toasts.push(args),
          };
        return require(name);
      },
    },
  );
  const render = () => {
    cursor = 0;
    refCursor = 0;
    return screen.exports.NotificationSettingsScreen(props);
  };
  const toggles = () =>
    descendants(render())
      .filter((node) => node.type === "Toggle")
      .map((node) => node.props);
  return { render, toggles, toasts, cleanup: () => cleanup(), states };
}

function descendants(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(descendants)];
}

test("Figma의 푸시 알림 항목·설명·공용 토글·safe area를 적용한다", () => {
  const { render, toggles } = setup();
  const children = React.Children.toArray(render().props.children);
  assert.equal(children[0].props.style, "dark");
  assert.equal(children[1].props.title, "알림 설정");
  assert.equal(children[1].props.titleClassName, undefined);
  assert.equal(children[2].props.contentContainerStyle.paddingBottom, 58);
  assert.deepEqual(
    Array.from(toggles(), (toggle) => toggle.accessibilityLabel),
    ["푸시 알림"],
  );
  assert.ok(toggles().every((toggle) => toggle.isOn && !toggle.isDisabled));
});

test("푸시 알림을 껐다 켜며 앱 알림 OFF가 기기 권한 배너를 만들지 않는다", async () => {
  const { toggles } = setup();
  await toggles()[0].onChange(false);
  assert.ok(toggles().every((toggle) => !toggle.isOn));
  assert.equal(toggles()[0].isDisabled, false);
  await toggles()[0].onChange(true);
  assert.equal(toggles()[0].isOn, true);
});

test("저장 성공 시 다음 설정을 전달하고 실패 시 이전 설정과 회색 토스트를 복원한다", async () => {
  for (const hasFailure of [false, true]) {
    const saved = [];
    const { toggles, toasts } = setup({
      onSaveSettings: async (settings) => {
        saved.push(settings);
        if (hasFailure) throw new Error("API failure");
      },
    });
    await toggles()[0].onChange(false);
    assert.equal(saved[0].isAllEnabled, false);
    assert.equal(saved[0].isCommentEnabled, true);
    assert.equal(toggles()[0].isOn, hasFailure);
    assert.ok(toggles().every((toggle) => !toggle.isDisabled));
    assert.deepEqual(
      toasts,
      hasFailure ? [["알림 설정을 저장하지 못했습니다. 다시 시도해 주세요."]] : [],
    );
  }
});

test("저장 중 중복 요청을 막고 언마운트 후 실패 토스트를 표시하지 않는다", async () => {
  let finish,
    calls = 0;
  const { toggles, toasts, cleanup } = setup({
    onSaveSettings: () => {
      calls++;
      return new Promise((resolve, reject) => {
        finish = reject;
      });
    },
  });
  const pending = toggles()[0].onChange(false);
  assert.ok(toggles().every((toggle) => toggle.isDisabled));
  await toggles()[0].onChange(false);
  assert.equal(calls, 1);
  cleanup();
  finish(new Error("late failure"));
  await pending;
  assert.equal(toasts.length, 0);
});

test("기기에서 차단하면 토글은 OFF·비활성이고 다시 허용하면 저장된 설정을 복원한다", async () => {
  for (const isAllEnabled of [true, false]) {
    const saved = [];
    const props = {
      isDevicePushEnabled: false,
      initialSettings: {
        isAllEnabled,
        isVoteEndEnabled: isAllEnabled,
        isCommentEnabled: isAllEnabled,
        isLikeEnabled: isAllEnabled,
      },
      onSaveSettings: async (settings) => saved.push(settings),
    };
    const context = setup(props);
    assert.equal(context.toggles()[0].isOn, false);
    assert.equal(context.toggles()[0].isDisabled, true);
    await context.toggles()[0].onChange(true);
    assert.equal(saved.length, 0);
    assert.equal(context.toggles()[0].isOn, false);
    props.isDevicePushEnabled = true;
    assert.equal(context.toggles()[0].isOn, isAllEnabled);
    assert.equal(context.toggles()[0].isDisabled, false);
    await context.toggles()[0].onChange(!isAllEnabled);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].isAllEnabled, !isAllEnabled);
    props.isDevicePushEnabled = false;
    assert.equal(context.toggles()[0].isOn, false);
    assert.equal(context.toggles()[0].isDisabled, true);
  }
});

test("기기 알림이 꺼졌을 때만 닫기 없는 배너와 설정 이동을 제공한다", () => {
  let opened = 0;
  const context = setup({ isDevicePushEnabled: false, onOpenNotificationSettings: () => opened++ });
  const banner = descendants(context.render()).find((node) => node.type === "PushOffBanner");
  assert.equal(banner.props.onClose, undefined);
  assert.equal(banner.props.title, "기기 알림이 꺼져 있습니다.");
  assert.equal(banner.props.description, "알림을 받으려면 기기 설정에서 알림을 허용해 주세요.");
  banner.props.onOpenSettings();
  assert.equal(opened, 1);
  for (const isDevicePushEnabled of [true, undefined]) {
    assert.equal(
      descendants(setup({ isDevicePushEnabled }).render()).some(
        (node) => node.type === "PushOffBanner",
      ),
      false,
    );
  }
  assert.ok(
    descendants(context.render()).some(
      (node) => node.props.children === "푸시 알림을 꺼도 알림함에서 확인할 수 있습니다.",
    ),
  );
});

function setupRoute(
  platform = "ios",
  pushSetting = { isLoaded: false, settings: {}, save: async () => {} },
) {
  let state,
    effect,
    onAppState,
    permission = { granted: false },
    settingsFailure = false;
  const calls = { reads: 0, opened: 0, alerts: 0, removed: 0 };
  const route = { exports: {} };
  const mocks = {
    "react": {
      useState: () => [
        state,
        (value) => {
          state = value;
        },
      ],
      useEffect: (callback) => {
        effect ??= callback;
      },
    },
    "react-native": {
      Platform: { OS: platform },
      AppState: {
        addEventListener: (_, listener) => {
          onAppState = listener;
          return { remove: () => calls.removed++ };
        },
      },
      Linking: {
        openSettings: async () => {
          calls.opened++;
          if (settingsFailure) throw new Error("unavailable");
        },
      },
      Alert: { alert: () => calls.alerts++ },
    },
    "expo-notifications": {
      getPermissionsAsync: async () => {
        calls.reads++;
        return permission;
      },
      IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
    },
    "@/screens/my/NotificationSettingsScreen": { NotificationSettingsScreen: "Settings" },
    "@/screens/my/queries/usePushSetting": { usePushSetting: () => pushSetting },
    "@/components/MemberOnly": { MemberOnly: "MemberOnly" },
  };
  runInNewContext(
    ts.transpileModule(
      readFileSync(path.join(__dirname, "../src/app/notification-settings.tsx"), "utf8"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      },
    ).outputText,
    {
      module: route,
      exports: route.exports,
      require: (name) => mocks[name] ?? require(name),
      console,
    },
  );
  const render = () => {
    const content = route.exports.default().props.children;
    return content.type(content.props);
  };
  render();
  const cleanup = effect();
  return {
    render,
    calls,
    cleanup,
    resume: () => onAppState("active"),
    setPermission: (value) => {
      permission = value;
    },
    failSettings: () => {
      settingsFailure = true;
    },
  };
}

test("기기 권한 조회·설정 복귀 시 갱신·iOS 임시 허용·언마운트를 처리한다", async () => {
  const context = setupRoute();
  await new Promise(setImmediate);
  assert.equal(context.render().props.isDevicePushEnabled, false);
  for (const permission of [
    { granted: true },
    { granted: false, ios: { status: 3 } },
    { granted: false, ios: { status: 4 } },
  ]) {
    context.setPermission(permission);
    context.resume();
    await new Promise(setImmediate);
    assert.equal(context.render().props.isDevicePushEnabled, true);
  }
  await context.render().props.onOpenNotificationSettings();
  assert.equal(context.calls.opened, 1);
  context.failSettings();
  await context.render().props.onOpenNotificationSettings();
  await new Promise(setImmediate);
  assert.equal(context.calls.alerts, 1);
  context.setPermission({ granted: false });
  context.resume();
  context.cleanup();
  await new Promise(setImmediate);
  assert.equal(context.calls.removed, 1);
  assert.equal(context.render().props.isDevicePushEnabled, true);
});

test("웹에서는 네이티브 알림 권한을 조회하지 않는다", async () => {
  const context = setupRoute("web");
  await new Promise(setImmediate);
  assert.equal(context.calls.reads, 0);
  assert.equal(context.render().props.isDevicePushEnabled, undefined);
});

test("저장된 Push 수신 여부를 받으면 토글 초기값으로 쓰고, 바꾸면 저장한다", () => {
  const save = async () => {};
  const settings = { isAllEnabled: false };
  const loading = setupRoute("ios", { isLoaded: false, settings: { isAllEnabled: true }, save });
  const loaded = setupRoute("ios", { isLoaded: true, settings, save });
  const before = loading.render();
  const after = loaded.render();
  assert.notEqual(before.key, after.key, "값을 받으면 화면을 다시 만들어 초기값을 반영한다");
  assert.equal(after.props.initialSettings, settings);
  assert.equal(after.props.onSaveSettings, save);
});

test("Push 수신 여부를 불러와 화면 설정으로 바꾸고, 저장하면 서버와 캐시에 반영한다", async () => {
  const saved = [];
  const cache = new Map();
  let data;
  const hook = { exports: {} };
  runInNewContext(
    ts.transpileModule(
      readFileSync(path.join(__dirname, "../src/screens/my/queries/usePushSetting.ts"), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    {
      module: hook,
      exports: hook.exports,
      require: (name) =>
        ({
          "@tanstack/react-query": {
            useQuery: ({ queryKey, enabled }) => {
              assert.deepEqual(queryKey, ["notification-settings", "user-a"]);
              assert.equal(enabled, true);
              return { data, isSuccess: data !== undefined };
            },
            useQueryClient: () => ({
              setQueryData: (key, value) => cache.set(key.join("/"), value),
            }),
          },
          "@/contexts/AuthContext": {
            useAuth: () => ({ session: { user: { id: "user-a" } }, isRestoring: false }),
          },
          "../api/notificationSettings": {
            notificationSettingKeys: { push: (viewer) => ["notification-settings", viewer] },
            fetchPushEnabled: async () => true,
            savePushEnabled: async (enabled) => saved.push(enabled),
          },
        })[name] ?? require(name),
    },
  );
  const loading = hook.exports.usePushSetting();
  assert.equal(loading.isLoaded, false);
  assert.equal(loading.settings.isAllEnabled, true, "불러오기 전에는 기본값(켬)");
  data = false;
  const loaded = hook.exports.usePushSetting();
  assert.equal(loaded.isLoaded, true);
  assert.equal(loaded.settings.isAllEnabled, false);
  await loaded.save({ ...loaded.settings, isAllEnabled: true });
  assert.deepEqual(saved, [true]);
  assert.equal(cache.get("notification-settings/user-a"), true);
});
