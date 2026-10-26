/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function load(file, mocks, globals = {}) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      ...globals,
      require: (name) => mocks[name] ?? (name.startsWith("@/assets/") ? name : require(name)),
    },
  );
  return module.exports;
}

function guideHarness({ records = new Map(), storageFailure = false } = {}) {
  let state, focus;
  const auth = { session: { user: { id: "user-a" } }, isRestoring: false };
  const params = {};
  const reads = [],
    writes = [];
  let pendingRead;
  const mockApi = {
    fetchDismissedFirstVisitGuides: async (userId) => {
      reads.push(userId);
      if (pendingRead) return pendingRead(userId);
      if (storageFailure) throw new Error("offline");
      return [...(records.get(userId) ?? [])];
    },
    dismissFirstVisitGuide: async (userId, kind) => {
      writes.push({ userId, kind });
      if (storageFailure) throw new Error("offline");
      records.set(userId, new Set([...(records.get(userId) ?? []), kind]));
    },
  };
  const { useFirstVisitGuide } = load(
    "../src/hooks/useFirstVisitGuide.ts",
    {
      "react": {
        useState: (initial) => {
          if (state === undefined) state = initial;
          return [
            state,
            (value) => {
              state = value;
            },
          ];
        },
        useCallback: (fn) => fn,
      },
      "expo-router": {
        useFocusEffect: (fn) => {
          focus = fn;
        },
        useLocalSearchParams: () => params,
      },
      "@/contexts/AuthContext": { useAuth: () => auth },
      "@/api/firstVisitGuides": mockApi,
      // 이전 기기 단위 기록은 새 계정의 서버 기록으로 승계하지 않는다.
      "@react-native-async-storage/async-storage": {
        getItem: async () => "dismissed",
        setItem: async () => {},
      },
    },
    { __DEV__: true },
  );
  return {
    auth,
    params,
    records,
    reads,
    writes,
    render: (kind = "all", enabled = true) => useFirstVisitGuide(kind, enabled),
    focus: () => focus(),
    deferRead: (fn) => {
      pendingRead = fn;
    },
  };
}

const settleGuide = () => new Promise((resolve) => setImmediate(resolve));

test("세 안내는 계정별로 별도 기록하고 같은 계정 재로그인·새 기기에서도 반복하지 않는다", async () => {
  const h = guideHarness();
  for (const kind of ["all", "folder", "item-detail"]) {
    assert.equal(h.render(kind).isVisible, false);
    const blur = h.focus();
    await settleGuide();
    assert.equal(h.render(kind).isVisible, true);
    h.render(kind).dismiss();
    await settleGuide();
    assert.equal(h.render(kind).isVisible, false);
    assert.ok(h.records.get("user-a").has(kind));
    blur();
    h.render(kind);
    h.focus();
    await settleGuide();
    assert.equal(h.render(kind).isVisible, false);
  }
  assert.equal(h.writes.length, 3);
  const otherDevice = guideHarness({ records: h.records });
  for (const kind of ["all", "folder", "item-detail"]) {
    otherDevice.render(kind);
    otherDevice.focus();
    await settleGuide();
    assert.equal(otherDevice.render(kind).isVisible, false);
  }
  h.auth.session = { user: { id: "user-b" } };
  h.render();
  h.focus();
  await settleGuide();
  assert.equal(h.render().isVisible, true, "같은 기기의 다른 계정에는 표시한다");
  h.render().dismiss();
  await settleGuide();
  assert.deepEqual(h.writes.at(-1), { userId: "user-b", kind: "all" });
  h.auth.session = { user: { id: "rejoined-user" } };
  h.render();
  h.focus();
  await settleGuide();
  assert.equal(h.render().isVisible, true, "탈퇴 후 새 계정으로 재가입하면 표시한다");
});

test("복원 중·비회원·비활성 화면에는 표시하지 않고 계정 전환 전 늦은 응답을 버린다", async () => {
  const h = guideHarness();
  h.auth.isRestoring = true;
  h.render();
  h.focus();
  await settleGuide();
  assert.equal(h.render().isVisible, false);
  assert.equal(h.reads.length, 0);
  h.auth.isRestoring = false;
  h.auth.session = null;
  h.render();
  h.focus();
  await settleGuide();
  assert.equal(h.render().isVisible, false);
  assert.equal(h.reads.length, 0);
  h.auth.session = { user: { id: "user-a" } };
  h.render("folder", false);
  h.focus();
  await settleGuide();
  assert.equal(h.render("folder", false).isVisible, false);
  let resolve;
  h.deferRead(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  h.render();
  const blur = h.focus();
  h.auth.session = { user: { id: "user-b" } };
  assert.equal(h.render().isVisible, false);
  blur();
  resolve([]);
  await settleGuide();
  assert.equal(h.render().isVisible, false);
  const visible = guideHarness();
  visible.render();
  visible.focus();
  await settleGuide();
  assert.equal(visible.render().isVisible, true);
  visible.auth.session = { user: { id: "user-b" } };
  assert.equal(visible.render().isVisible, false, "새 계정 첫 렌더에 이전 안내가 남지 않는다");
});

test("서버 실패에도 안내를 닫을 수 있고 개발 미리보기는 서버 기록을 변경하지 않는다", async () => {
  const h = guideHarness({ storageFailure: true });
  h.render();
  h.focus();
  await settleGuide();
  assert.equal(h.render().isVisible, true);
  h.render().dismiss();
  await settleGuide();
  h.render();
  h.focus();
  await settleGuide();
  assert.equal(h.render().isVisible, false);
  const preview = guideHarness();
  preview.params.guide = "all";
  preview.auth.session = null;
  preview.render();
  const blur = preview.focus();
  assert.equal(preview.render().isVisible, true);
  preview.render().dismiss();
  blur();
  assert.equal(preview.reads.length, 0);
  assert.equal(preview.writes.length, 0);
});

for (const os of ["android", "ios"]) {
  test(`${os} 강조 영역은 측정 좌표에 상태바 높이를 중복 가산하지 않는다`, () => {
    const states = [];
    let cursor = 0;
    let measure;
    let closeCount = 0;
    const { FirstVisitGuide } = load(
      "../src/components/FirstVisitGuide.tsx",
      {
        "react": {
          useEffect: (callback) => callback(),
          useState: (initial) => {
            const index = cursor++;
            states[index] ??= initial;
            return [
              states[index],
              (value) => {
                states[index] = typeof value === "function" ? value(states[index]) : value;
              },
            ];
          },
        },
        "react-native": {
          Modal: "Modal",
          View: "View",
          Text: "Text",
          Pressable: "Pressable",
          Platform: { OS: os },
          useWindowDimensions: () => ({ width: 375, height: 762 }),
        },
        "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 50, bottom: 0 }) },
        "@/hooks/useNativeModalVisible": { useNativeModalVisible: (visible) => visible },
        "expo-image": { Image: "Image" },
        "react-native-svg": {
          __esModule: true,
          default: "Svg",
          Defs: "Defs",
          Mask: "Mask",
          Rect: "Rect",
        },
        "@/theme": { colors: { gray: { 1000: "#000" } } },
      },
      {
        setTimeout: (callback) => {
          measure = callback;
        },
        clearTimeout() {},
        requestAnimationFrame: (callback) => callback(),
        cancelAnimationFrame() {},
      },
    );
    const props = {
      kind: "item-detail",
      onClose: () => closeCount++,
      targets: {
        wish: { current: { measureInWindow: (callback) => callback(17, 410, 84, 48) } },
        vote: { current: { measureInWindow: (callback) => callback(0, 620, 375, 42) } },
      },
    };
    const render = () => {
      cursor = 0;
      return FirstVisitGuide(props);
    };
    render();
    measure();
    const tree = render();
    const find = (node, type) =>
      !React.isValidElement(node)
        ? []
        : [
            ...(node.type === type ? [node] : []),
            ...React.Children.toArray(node.props.children).flatMap((child) => find(child, type)),
          ];
    const holes = find(tree, "Rect").filter((node) => node.props.fill === "black");
    assert.equal(holes[0].props.y, 416);
    assert.equal(holes[0].props.height, 36);
    assert.equal(holes[1].props.y, 620);
    assert.equal(holes[1].props.width, 375);
    assert.equal(holes[1].props.height, 42);
    assert.equal(find(tree, "Svg")[0].props.height, 812);
    assert.equal(find(tree, "Mask")[0].props.maskUnits, "userSpaceOnUse");
    find(tree, "Pressable")[0].props.onPress();
    tree.props.onRequestClose();
    assert.equal(closeCount, 2);
  });
}
