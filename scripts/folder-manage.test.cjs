/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function nodes(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}

test("소장템 선택 시 유지·제외·취소를 구분하고 완료 시에만 반영한다", () => {
  const state = [];
  let cursor = 0;
  const completed = [];
  const component = { exports: {} };
  const mocks = {
    "react": {
      useRef: () => ({ current: null }),
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [
          state[index],
          (next) => {
            state[index] = typeof next === "function" ? next(state[index]) : next;
          },
        ];
      },
    },
    "react-native": {
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      Text: "Text",
      View: "View",
    },
    "@/components/BottomSheet": { BottomSheet: "BottomSheet" },
    "@/components/Button": { Button: "Button" },
    "@/components/modal": { ActionModal: "ActionModal" },
    "@/screens/folder/components/FolderNameModal": { FolderNameModal: "FolderNameModal" },
  };
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        path.join(__dirname, "../src/screens/item-detail/components/FolderManageSheet.tsx"),
        "utf8",
      ),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      },
    ).outputText,
    {
      module: component,
      exports: component.exports,
      require: (name) => mocks[name] ?? (name.startsWith("@/assets/") ? name : require(name)),
    },
  );
  const render = () => {
    cursor = 0;
    return component.exports.FolderManageSheet({
      folders: [
        { id: "owned", name: "나의 소장템", isOwnedItems: true },
        { id: "pants", name: "바지" },
      ],
      selectedFolderIds: ["pants"],
      onComplete: (ids) => completed.push(Array.from(ids)),
      onClose() {},
    });
  };
  const row = (name) => nodes(render()).find((node) => node.props.accessibilityLabel === name);
  const modal = () => render().props.overlay.props;
  const finish = () =>
    nodes(render())
      .find((node) => node.type === "Button")
      .props.onPress();
  assert.equal(modal().visible, false);
  row("나의 소장템").props.onPress();
  assert.equal(modal().visible, true);
  assert.equal(completed.length, 0);
  modal().secondaryAction.onPress();
  finish();
  assert.deepEqual(completed.pop(), ["pants", "owned"]);
  row("나의 소장템").props.onPress();
  assert.equal(modal().visible, false, "선택 해제 시 모달 없음");
  row("나의 소장템").props.onPress();
  modal().onRequestClose();
  assert.equal(row("나의 소장템").props.accessibilityState.checked, false);
  assert.equal(row("바지").props.accessibilityState.checked, true);
  row("나의 소장템").props.onPress();
  modal().primaryAction.onPress();
  assert.equal(row("바지").props.accessibilityState.checked, false);
  finish();
  assert.deepEqual(completed.pop(), ["owned"]);
});
