const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(file, mocks) {
  const compiled = ts.transpileModule(readFileSync(path.join(__dirname, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    Promise,
    require: (name) => mocks[name] ?? require(name),
  });
  return module.exports;
}

test("링크를 직접 넣는 시트가 떠 있으면 감지 모달을 띄우지 않고 그 링크는 다시 묻지 않는다", async () => {
  let effect;
  const pause = load("../src/hooks/useLinkDetectionPause.ts", {
    react: { useEffect: (callback) => (effect = callback) },
  });
  pause.useLinkDetectionPause(true);
  const release = effect();

  const state = [];
  let cursor = 0;
  const effects = [];
  const { useDetectedLink } = load("../src/hooks/useDetectedLink.ts", {
    "react": {
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => (state[index] = value)];
      },
      useRef: (initial) => ({ current: initial }),
      useCallback: (callback) => callback,
      useEffect: (callback) => effects.push(callback),
    },
    "react-native": {
      AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
    },
    "expo-clipboard": {
      hasStringAsync: async () => true,
      getStringAsync: async () => "https://zigzag.kr/catalog/products/1",
    },
    "@/hooks/useLinkDetectionPause": pause,
    "@/utils/itemLink": { findItemLink: (text) => text },
  });
  useDetectedLink();
  effects[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(state[0], null, "시트가 떠 있는 동안에는 감지 모달을 띄우지 않는다");
  release();
});
