/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function loadPasteGuide() {
  const state = [];
  let cursor = 0;
  let effectDeps;
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(
      readFileSync(path.join(__dirname, "../src/hooks/usePasteGuide.ts"), "utf8"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      },
    ).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        if (name === "react")
          return {
            useState: (initial) => {
              const index = cursor++;
              if (!(index in state)) state[index] = initial;
              return [state[index], (value) => (state[index] = value)];
            },
            useRef: (initial) => {
              const index = cursor++;
              if (!(index in state)) state[index] = { current: initial };
              return state[index];
            },
            useCallback: (callback) => callback,
            // 의존값이 바뀌었을 때만 효과를 실행한다.
            useEffect: (effect, deps) => {
              if (!effectDeps || deps.some((value, i) => value !== effectDeps[i])) effect();
              effectDeps = deps;
            },
          };
        if (name === "react-native") return { Platform: { OS: "ios" } };
        return require(name);
      },
    },
  );
  return (trigger) => {
    cursor = 0;
    return module.exports.usePasteGuide(trigger);
  };
}

test("다음에 하기로 닫아도 다음 불러오기에서 다시 안내한다", () => {
  const render = loadPasteGuide();
  assert.equal(render(false).isVisible, false);
  render(true);
  const shown = render(true);
  assert.equal(shown.isVisible, true);
  shown.dismiss();
  assert.equal(render(true).isVisible, false, "같은 불러오기에서는 다시 띄우지 않는다");
  render(false);
  render(true);
  assert.equal(render(true).isVisible, true, "다음 불러오기에서 다시 띄운다");
});
