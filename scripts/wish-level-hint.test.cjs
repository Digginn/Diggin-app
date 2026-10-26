/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function loadWishLevel(stored) {
  const saved = [];
  const module = { exports: {} };
  const compiled = ts.transpileModule(
    readFileSync(path.join(__dirname, "../src/components/WishLevel.tsx"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    Promise,
    require: (name) => {
      if (name === "@react-native-async-storage/async-storage")
        return {
          __esModule: true,
          default: {
            getItem: async (key) => stored[key] ?? null,
            setItem: async (key, value) => {
              stored[key] = value;
              saved.push(key);
            },
          },
        };
      if (name === "react-native")
        return {
          Modal: "Modal",
          Pressable: "Pressable",
          StyleSheet: { absoluteFill: {} },
          Text: "Text",
          View: "View",
          useWindowDimensions: () => ({ height: 800 }),
        };
      if (name === "nativewind") return { cssInterop: (component) => component };
      if (name === "expo-linear-gradient") return { LinearGradient: "LinearGradient" };
      if (name === "@/hooks/useNativeModalVisible")
        return { useNativeModalVisible: (visible) => visible };
      if (name.startsWith("@/")) return new Proxy({}, { get: (_, key) => key });
      return require(name);
    },
  });

  // 컴포넌트 하나를 그리는 최소 실행기. 상태는 다시 그릴 때 이어진다.
  const state = [];
  let cursor = 0;
  const realUseState = React.useState;
  const realUseRef = React.useRef;
  React.useState = (initial) => {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [
      state[index],
      (next) => {
        state[index] = typeof next === "function" ? next(state[index]) : next;
      },
    ];
  };
  React.useRef = () => ({ current: { measureInWindow: (callback) => callback(0, 0, 80, 32) } });
  const render = (hint) => {
    cursor = 0;
    return module.exports.WishLevel({ levels: { high: 0, medium: 0, low: 0 }, hint });
  };
  const restore = () => {
    React.useState = realUseState;
    React.useRef = realUseRef;
  };
  return { render, state, saved, restore };
}

function findChip(tree) {
  return tree.props.children.find((child) => child?.props?.accessibilityLabel === "위시 레벨 필터");
}

const isHintOpen = (tree) =>
  JSON.stringify(tree, (_, value) => (typeof value === "function" ? undefined : value)).includes(
    '"arrowPosition":"left"',
  );

test("위시 레벨 툴팁은 처음 펼칠 때 한 번 자동으로 열고 본 것으로 저장한다", async () => {
  const stored = {};
  const first = loadWishLevel(stored);
  try {
    findChip(first.render("설명")).props.onPress();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(isHintOpen(first.render("설명")), true);
    assert.deepEqual(first.saved, ["wish-level-tooltip-seen:설명"]);
  } finally {
    first.restore();
  }

  // 앱을 다시 켜도 저장된 기록이 있으면 자동으로 열지 않는다.
  const again = loadWishLevel(stored);
  try {
    findChip(again.render("설명")).props.onPress();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(isHintOpen(again.render("설명")), false);
  } finally {
    again.restore();
  }
});
