/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

// 실제 모달 모듈을 불러오고 native 뷰와 SVG 렌더러만 대체합니다.
const modules = new Map();
function loadModule(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(compiled, {
    exports: loaded.exports,
    module: loaded,
    require: (name) => {
      if (name === "react") return { ...React, useEffect: () => {} };
      if (name === "@/components/ToastText") return { ToastText: "ToastText" };
      if (name === "react-native") {
        return {
          Modal: "NativeModal",
          View: "View",
          Pressable: "Pressable",
          Text: "Text",
          TextInput: "TextInput",
        };
      }
      if (name === "nativewind") return { cssInterop: (icon) => icon };
      if (name.endsWith(".svg")) return { default: "Svg" };
      if (name === "@/theme") return loadModule(path.join(__dirname, "../src/theme/colors.ts"));
      if (name.startsWith(".")) {
        const base = path.resolve(path.dirname(filename), name);
        return loadModule(base + (name === "./index" ? ".ts" : ".tsx"));
      }
      return require(name);
    },
  });
  return loaded.exports;
}
const modals = loadModule(path.join(__dirname, "../src/components/modal/index.ts"));
function flatten(node) {
  if (!React.isValidElement(node)) return [];
  if (typeof node.type === "function") return flatten(node.type(node.props));
  return [node, ...React.Children.toArray(node.props.children).flatMap(flatten)];
}

test("공개 모달만 export하고 공용 껍데기의 바깥 영역은 닫힘 핸들러가 없다", () => {
  assert.deepEqual(Object.keys(modals).sort(), [
    "ActionModal",
    "FolderModal",
    "Modal",
    "ReportModal",
  ]);
  const close = () => {};
  const shell = modals.Modal({
    visible: true,
    onRequestClose: close,
    children: React.createElement("Text", null, "내용"),
  });
  assert.equal(shell.type, "NativeModal");
  assert.equal(shell.props.visible, true);
  assert.equal(shell.props.onRequestClose, close);
  const nodes = flatten(shell);
  const scrim = nodes.find((node) => node.props.className === "absolute inset-0 bg-gray-1000");
  assert.equal(scrim.type, "View");
  assert.equal(scrim.props.onPress, undefined);
  assert.equal(scrim.props.style.opacity, 0.4);

  const withToast = modals.Modal({
    visible: true,
    onRequestClose: close,
    children: React.createElement("Text", null, "내용"),
    toastMessage: "저장하지 못했습니다.",
  });
  const toast = flatten(withToast).find((node) => node.type === "ToastText");
  assert.equal(toast.props.message, "저장하지 못했습니다.");
  assert.equal(toast.props.variant, undefined);
  assert.equal(withToast.type, "NativeModal");
});

test("FolderModal 문구와 폴더 이름은 사용처 props를 표시하고 콜백을 전달한다", () => {
  const calls = [];
  for (const [title, productName, description, selectedFolderName] of [
    ["아이템 저장", "운동화", "런닝용", "운동"],
    ["다른 제목", "노트북", "작업용", "기기"],
  ]) {
    const nodes = flatten(
      modals.FolderModal({
        visible: true,
        onRequestClose: () => {},
        title,
        productName,
        description,
        selectedFolderName,
        onPressFolderSelect: () => calls.push("select"),
        onBack: () => calls.push("back"),
        onLoad: () => calls.push("load"),
        onSave: () => calls.push("save"),
      }),
    );
    const labels = nodes.filter((node) => node.type === "Text").map((node) => node.props.children);
    for (const label of [title, productName, description, selectedFolderName])
      assert.ok(labels.includes(label));
    nodes
      .find((node) => node.props.accessibilityLabel === `폴더 선택: ${selectedFolderName}`)
      .props.onPress();
    for (const label of ["돌아가기", "불러오기", "저장하기"]) {
      const button = nodes.find(
        (node) =>
          node.type === "Pressable" &&
          flatten(node).some((child) => child.type === "Text" && child.props.children === label),
      );
      button.props.onPress();
    }
  }
  assert.deepEqual(calls, ["select", "back", "load", "save", "select", "back", "load", "save"]);
});
