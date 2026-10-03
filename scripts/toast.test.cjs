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
  showToast("파일에서 상품 정보를 찾을 수 없습니다.", "error");
  assert.equal(timers.get(timerRef.current).delay, 4000);
  const errorOverlay = React.Children.toArray(render().props.children.props.children)[1];
  assert.equal(errorOverlay.props.children.props.children.props.variant, "error");
  showToast("새 메시지");
  cleanup();
  assert.equal(timers.size, 0);
});

test("에러 토스트는 Figma 아이콘·에러 토큰·첫 줄 정렬을 사용하고 기본 토스트는 유지한다", () => {
  const toastModule = { exports: {} };
  const source = readFileSync(path.join(__dirname, "../src/components/ToastText.tsx"), "utf8");
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module: toastModule,
      exports: toastModule.exports,
      require: (name) => {
        if (name === "react-native") return { View: "View", Text: "Text" };
        if (name === "@/assets/images/toast") return { IconToastError: "IconToastError" };
        return require(name);
      },
    },
  );
  const error = toastModule.exports.ToastText({ message: "오류 안내", variant: "error" });
  assert.match(error.props.className, /items-start/);
  assert.match(error.props.className, /border-semantic-errorOnDark bg-semantic-errorBgDark/);
  const children = React.Children.toArray(error.props.children);
  assert.equal(children[0].props.children.type, "IconToastError");
  assert.match(children[1].props.className, /shrink text-left text-semantic-errorOnDark/);
  assert.equal(children[1].props.lineBreakStrategyIOS, "hangul-word");
  const defaultToast = toastModule.exports.ToastText({ message: "완료 안내" });
  assert.match(defaultToast.props.className, /border-gray-800 bg-gray-700/);
  assert.equal(React.Children.toArray(defaultToast.props.children).length, 1);
});
