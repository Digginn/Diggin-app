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
  const rows = () => React.Children.toArray(render().props.children)[2].props.children;
  const toggles = () => rows().map((row) => React.Children.toArray(row.props.children)[1].props);
  return { render, toggles, toasts, cleanup: () => cleanup(), states };
}

test("Figma의 네 가지 항목·공용 토글·48px 행·safe area를 적용한다", () => {
  const { render, toggles } = setup();
  const children = React.Children.toArray(render().props.children);
  assert.equal(children[0].props.style, "dark");
  assert.equal(children[1].props.title, "알림 설정");
  assert.equal(children[1].props.titleClassName, "font-label-20-medium");
  assert.equal(children[2].props.contentContainerStyle.paddingBottom, 58);
  assert.deepEqual(
    Array.from(toggles(), (toggle) => toggle.accessibilityLabel),
    ["전체 알림", "투표 종료 알림", "게시글 댓글 알림", "게시글 좋아요 알림"],
  );
  assert.ok(toggles().every((toggle) => toggle.isOn && !toggle.isDisabled));
});

test("개별 설정을 변경하고 전체 OFF→ON에서 하위 선택을 복원한다", async () => {
  const { toggles } = setup();
  await toggles()[1].onChange(false);
  assert.equal(toggles()[1].isOn, false);
  assert.equal(toggles()[2].isOn, true);
  await toggles()[0].onChange(false);
  assert.ok(toggles().every((toggle) => !toggle.isOn));
  assert.ok(
    toggles()
      .slice(1)
      .every((toggle) => toggle.isDisabled),
  );
  await toggles()[0].onChange(true);
  assert.equal(toggles()[1].isOn, false);
  assert.equal(toggles()[2].isOn, true);
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
    await toggles()[2].onChange(false);
    assert.equal(saved[0].isCommentEnabled, false);
    assert.equal(toggles()[2].isOn, hasFailure);
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
  const pending = toggles()[3].onChange(false);
  assert.ok(toggles().every((toggle) => toggle.isDisabled));
  await toggles()[0].onChange(false);
  assert.equal(calls, 1);
  cleanup();
  finish(new Error("late failure"));
  await pending;
  assert.equal(toasts.length, 0);
});
