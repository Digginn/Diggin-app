/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

test("토스트는 하단 160px에 표시되고 새 메시지·자동 닫힘·언마운트에 타이머를 정리한다", () => {
  let message;
  let cleanup;
  let nextTimer = 0;
  const timerRef = { current: undefined };
  const timers = new Map();
  const source = readFileSync(path.join(__dirname, "../src/contexts/ToastContext.tsx"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const toastModule = { exports: {} };
  runInNewContext(compiled, {
    exports: toastModule.exports,
    module: toastModule,
    setTimeout: (callback, delay) => {
      timers.set(++nextTimer, { callback, delay });
      return nextTimer;
    },
    clearTimeout: (id) => timers.delete(id),
    require: (name) => {
      if (name === "react")
        return {
          ...React,
          createContext: () => ({ Provider: "Provider" }),
          useState: () => [
            message,
            (value) => {
              message = value;
            },
          ],
          useRef: () => timerRef,
          useCallback: (callback) => callback,
          useEffect: (effect) => {
            cleanup = effect();
          },
        };
      if (name === "react-native") return { View: "View" };
      if (name === "@/components/ToastText") return { ToastText: "ToastText" };
      return require(name);
    },
  });
  const render = () => toastModule.exports.ToastProvider({ children: "Screen" });
  const showToast = render().props.value;
  showToast("닉네임이 변경되었습니다.");
  const overlay = React.Children.toArray(render().props.children.props.children)[1];
  assert.ok(overlay.props.className.includes("bottom-[160px]"));
  assert.ok(overlay.props.children.props.className.includes("max-w-[327px]"));
  assert.equal(overlay.props.children.props.children.props.message, "닉네임이 변경되었습니다.");
  showToast("변경 실패");
  assert.equal(timers.size, 1);
  assert.equal(timers.get(timerRef.current).delay, 2000);
  timers.get(timerRef.current).callback();
  assert.equal(message, undefined);
  showToast("새 메시지");
  cleanup();
  assert.equal(timers.size, 0);
});
