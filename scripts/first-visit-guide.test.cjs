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

test("세 안내는 별도로 저장하며 닫은 안내·비활성 화면·늦은 응답은 표시하지 않는다", async () => {
  const storage = new Map();
  let state = false;
  let focus;
  let read;
  let params = {};
  const { useFirstVisitGuide } = load(
    "../src/hooks/useFirstVisitGuide.ts",
    {
      "react": {
        useState: () => [
          state,
          (value) => {
            state = value;
          },
        ],
        useCallback: (callback) => callback,
      },
      "expo-router": {
        useFocusEffect: (callback) => {
          focus = callback;
        },
        useLocalSearchParams: () => params,
      },
      "@react-native-async-storage/async-storage": {
        getItem: (key) => (read ? read(key) : Promise.resolve(storage.get(key))),
        setItem: (key, value) => {
          storage.set(key, value);
          return Promise.resolve();
        },
      },
    },
    { __DEV__: true },
  );
  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };
  for (const kind of ["all", "folder", "item-detail"]) {
    useFirstVisitGuide(kind);
    const blur = focus();
    await settle();
    assert.equal(state, true);
    useFirstVisitGuide(kind).dismiss();
    assert.equal(state, false);
    assert.equal(storage.get(`first-visit-guide:${kind}`), "dismissed");
    blur();
    useFirstVisitGuide(kind);
    focus();
    await settle();
    assert.equal(state, false);
  }
  params = { guide: "all" };
  useFirstVisitGuide("all", false);
  focus();
  assert.equal(state, false);
  useFirstVisitGuide("all");
  const blur = focus();
  assert.equal(state, true);
  useFirstVisitGuide("all").dismiss();
  assert.equal(storage.size, 3);
  blur();
  params = {};
  storage.delete("first-visit-guide:folder");
  // 새로운 훅 모듈로 읽기 중 화면을 벗어나는 경우도 확인합니다.
  let resolve;
  read = () =>
    new Promise((callback) => {
      resolve = callback;
    });
  const fresh = load(
    "../src/hooks/useFirstVisitGuide.ts",
    {
      "react": {
        useState: () => [
          state,
          (value) => {
            state = value;
          },
        ],
        useCallback: (callback) => callback,
      },
      "expo-router": {
        useFocusEffect: (callback) => {
          focus = callback;
        },
        useLocalSearchParams: () => params,
      },
      "@react-native-async-storage/async-storage": { getItem: read },
    },
    { __DEV__: false },
  );
  fresh.useFirstVisitGuide("folder");
  focus()();
  resolve(null);
  await settle();
  assert.equal(state, false);
});

test("강조 영역은 측정 위치·Android 상태바를 반영하고 VotePrompt 전체 너비를 유지한다", () => {
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
        Platform: { OS: "android" },
        useWindowDimensions: () => ({ width: 375, height: 762 }),
      },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 50, bottom: 0 }) },
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
  assert.equal(holes[0].props.y, 466);
  assert.equal(holes[0].props.height, 36);
  assert.equal(holes[1].props.y, 670);
  assert.equal(holes[1].props.width, 375);
  assert.equal(holes[1].props.height, 42);
  assert.equal(find(tree, "Svg")[0].props.height, 812);
  assert.equal(find(tree, "Mask")[0].props.maskUnits, "userSpaceOnUse");
  find(tree, "Pressable")[0].props.onPress();
  tree.props.onRequestClose();
  assert.equal(closeCount, 2);
});
