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
      if (name === "@/components/ToastText") return { ToastText: "ToastText" };
      if (name === "react-native") {
        return {
          Modal: "NativeModal",
          KeyboardAvoidingView: "KeyboardAvoidingView",
          Keyboard: { isVisible: () => false, addListener: () => ({ remove: () => {} }) },
          Platform: { OS: "android" },
          View: "View",
          Pressable: "Pressable",
          Text: "Text",
          TextInput: "TextInput",
        };
      }
      if (name === "react")
        return {
          ...React,
          useState: (value) => [typeof value === "function" ? value() : value, () => {}],
          useEffect: () => {},
        };
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
test("입력 모달은 iOS와 Android 모두 키보드 유무에 따라 중앙과 키보드 위로 전환한다", () => {
  for (const os of ["ios", "android"]) {
    const loaded = { exports: {} };
    let isVisible = false;
    let hasSubscribed = false;
    const listeners = {};
    const code = ts.transpileModule(
      readFileSync(path.join(__dirname, "../src/components/modal/Modal.tsx"), "utf8"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      },
    ).outputText;
    runInNewContext(code, {
      exports: loaded.exports,
      module: loaded,
      require: (name) => {
        if (name === "@/components/ToastText") return { ToastText: "ToastText" };
        if (name === "react")
          return {
            useState: () => [
              isVisible,
              (value) => {
                isVisible = value;
              },
            ],
            useEffect: (effect) => {
              if (!hasSubscribed) {
                hasSubscribed = true;
                effect();
              }
            },
          };
        if (name === "react-native")
          return {
            Modal: "NativeModal",
            View: "View",
            KeyboardAvoidingView: "KeyboardAvoidingView",
            Platform: { OS: os },
            Keyboard: {
              isVisible: () => false,
              addListener: (event, callback) => {
                listeners[event] = callback;
                return { remove: () => {} };
              },
            },
          };
        return require(name);
      },
    });
    const render = () =>
      loaded.exports.Modal({
        visible: true,
        isKeyboardAvoiding: true,
        keyboardGap: 24,
        onRequestClose: () => {},
        children: null,
      });
    const content = (tree) => React.Children.toArray(tree.props.children)[0].props.children;
    assert.ok(content(render()).props.className.includes("justify-center"));
    listeners[os === "ios" ? "keyboardWillShow" : "keyboardDidShow"]();
    assert.ok(content(render()).props.className.includes("justify-end"));
    assert.equal(content(render()).props.style.paddingBottom, 24);
    listeners[os === "ios" ? "keyboardWillHide" : "keyboardDidHide"]();
    assert.ok(content(render()).props.className.includes("justify-center"));
    assert.equal(content(render()).props.style, undefined);
  }
});
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
  const fullScreen = modals.Modal({
    visible: true,
    onRequestClose: close,
    children: React.createElement("Text", null, "인증 만료"),
    isFullScreen: true,
    scrimOpacity: 0.36,
    contentClassName: "w-full gap-4",
    toastMessage: "안내",
  });
  assert.equal(fullScreen.props.statusBarTranslucent, true);
  assert.equal(fullScreen.props.navigationBarTranslucent, true);
  const fullScreenNodes = flatten(fullScreen);
  assert.equal(
    fullScreenNodes.find((node) => node.props.className === "absolute inset-0 bg-gray-1000").props
      .style.opacity,
    0.36,
  );
  assert.ok(fullScreenNodes.some((node) => node.props.className === "w-full gap-4"));
  assert.ok(fullScreenNodes.some((node) => node.type === "ToastText"));
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
