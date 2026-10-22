/* global __dirname */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const React = require("react");

// Metro 번들처럼 각 컴포넌트 모듈은 읽기 전용(getter)으로, react-native 입구는 일반 getter로 흉내 낸다.
function readOnlyModule(value) {
  const module = {};
  Object.defineProperty(module, "default", { enumerable: true, get: () => value });
  return module;
}

test("공유 확장은 react-native의 Text·TextInput을 글자 배율을 끈 버전으로 바꾸고 정적 값은 둔다", () => {
  const Text = React.forwardRef(function Text() {
    return null;
  });
  const TextInput = React.forwardRef(function TextInput() {
    return null;
  });
  TextInput.State = { currentlyFocusedInput: () => null };
  const textModule = readOnlyModule(Text);
  const inputModule = readOnlyModule(TextInput);
  const reactNative = {
    get Text() {
      return textModule.default;
    },
    get TextInput() {
      return inputModule.default;
    },
  };
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function (id) {
    return id === "react-native" ? reactNative : originalRequire.apply(this, arguments);
  };
  try {
    require(path.join(__dirname, "../src/share/disableFontScaling.js"));
  } finally {
    Module.prototype.require = originalRequire;
  }
  for (const [Wrapped, Original] of [
    [reactNative.Text, Text],
    [reactNative.TextInput, TextInput],
  ]) {
    assert.notEqual(Wrapped, Original, "앱 코드가 가져가는 컴포넌트가 바뀐다");
    const element = Wrapped.render({ allowFontScaling: true, children: "a" }, null);
    assert.equal(element.type, Original, "원래 컴포넌트를 그린다");
    assert.equal(element.props.allowFontScaling, false, "배율은 항상 끈다");
    assert.equal(element.props.children, "a", "다른 값은 그대로 넘긴다");
  }
  assert.equal(reactNative.TextInput.State, TextInput.State);
});
