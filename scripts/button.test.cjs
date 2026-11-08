/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

// Native 렌더러 없이 실제 Button의 반환 트리와 prop 전달을 검사합니다.
const source = readFileSync(path.join(__dirname, "../src/components/Button.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const buttonModule = { exports: {} };
runInNewContext(compiled, {
  exports: buttonModule.exports,
  module: buttonModule,
  require: (name) =>
    name === "react-native" ? { Pressable: "Pressable", Text: "Text" } : require(name),
});
const { Button } = buttonModule.exports;
const onPress = () => {};

function assertTextIsWrapped(node, isInsideText = false) {
  if (typeof node === "string" || typeof node === "number") {
    assert.ok(isInsideText, "문자열/숫자는 Text 내부에 있어야 합니다");
    return;
  }
  if (React.isValidElement(node)) {
    React.Children.forEach(node.props.children, (child) =>
      assertTextIsWrapped(child, isInsideText || node.type === "Text"),
    );
  }
}

test("문자열·숫자 및 아이콘과 혼합된 children을 Text로 감싼다", () => {
  const icon = React.createElement("Icon", { key: "icon" });
  const explicitText = React.createElement("Text", { key: "text" }, "직접 감싼 문구");
  for (const children of [
    "Continue",
    0,
    [icon, "Continue", 3],
    [icon, ["중첩 배열", 0]],
    React.createElement(React.Fragment, null, icon, "Fragment 문구", 0),
    [icon, explicitText, null, false],
  ]) {
    assertTextIsWrapped(Button({ children, onPress }));
  }
  const mixed = React.Children.toArray(
    Button({ children: [icon, "Continue"], onPress }).props.children,
  );
  assert.equal(mixed[0].type, "Icon");
  assert.equal(mixed[1].type, "Text");
  assert.equal(mixed[1].props.children, "Continue");
  const existing = React.Children.toArray(
    Button({ children: explicitText, onPress }).props.children,
  );
  assert.equal(existing[0].props.children, "직접 감싼 문구");
});

test("isDisabled가 native disabled와 접근성 및 비활성 스타일에 적용된다", () => {
  const enabled = Button({ children: "등록", onPress });
  assert.equal(enabled.props.disabled, false);
  assert.equal(enabled.props.accessibilityState.disabled, false);
  assert.ok(enabled.props.className.includes("active:opacity-75"));
  const disabled = Button({ children: "등록", onPress, isDisabled: true });
  assert.equal(disabled.props.disabled, true);
  assert.equal(disabled.props.accessibilityState.disabled, true);
  assert.ok(disabled.props.className.includes("bg-gray-200"));
  assert.ok(!disabled.props.className.includes("active:opacity-75"));
  const label = React.Children.toArray(disabled.props.children)[0];
  assert.ok(label.props.className.includes("text-gray-500"));
  assert.equal(disabled.props.onPress, onPress);
});
