/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function setup(file, os) {
  const state = [];
  let cursor = 0;
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(path.join(__dirname, "../src", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => {
      if (name === "react")
        return {
          ...React,
          useState: (initial) => {
            const i = cursor++;
            if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
            return [
              state[i],
              (value) => {
                state[i] = value;
              },
            ];
          },
          useEffect() {},
          useMemo: (callback) => callback(),
        };
      if (name === "react-native")
        return {
          View: "View",
          Pressable: "Pressable",
          ScrollView: "ScrollView",
          KeyboardAvoidingView: "KeyboardAvoidingView",
          Modal: "Modal",
          Platform: { OS: os },
          Dimensions: { get: () => ({ height: 800 }) },
          Keyboard: { isVisible: () => true },
          AppState: { currentState: "active" },
          Animated: {
            Value: class {
              interpolate() {
                return this;
              }
            },
            add: (a) => a,
            View: "AnimatedView",
          },
        };
      if (name === "react-native-safe-area-context")
        return { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) };
      if (name === "@/hooks/useNativeModalVisible")
        return { useNativeModalVisible: (visible) => visible };
      if (name === "@/components/ToastText") return { ToastText: "ToastText" };
      if (name === "@/theme") return { colors: { gray: { 1000: "#000000" } } };
      return require(name);
    },
  });
  return (props) => {
    cursor = 0;
    return Object.values(module.exports)[0]({ visible: true, onRequestClose() {}, ...props });
  };
}
function nodes(tree) {
  if (!React.isValidElement(tree)) return [];
  return [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)];
}

test("Android 시트는 키보드로 줄어든 높이에 맞춰 폼을 제한하고 닫으면 높이를 복원한다", () => {
  const render = setup("components/BottomSheet.tsx", "android");
  const props = { isGrabberVisible: false, children: React.createElement("ScrollView") };
  let tree = render(props);
  const avoiding = nodes(tree).find((n) => n.type === "KeyboardAvoidingView");
  assert.equal(avoiding.props.behavior, "height");
  assert.equal(avoiding.props.style.flex, 1);
  assert.equal(avoiding.props.className.includes("flex-1"), false);
  avoiding.props.onLayout({ nativeEvent: { layout: { height: 380 } } });
  tree = render(props);
  const sheet = () => nodes(tree).find((n) => n.props.style?.paddingBottom === 16);
  assert.equal(sheet().props.style.maxHeight, 380);
  avoiding.props.onLayout({ nativeEvent: { layout: { height: 800 } } });
  tree = render(props);
  assert.equal(sheet().props.style.maxHeight, 688);
});

test("iOS 시트는 기존 padding 처리와 최대 높이를 유지한다", () => {
  const tree = setup("components/BottomSheet.tsx", "ios")({ isGrabberVisible: false });
  const avoiding = nodes(tree).find((n) => n.type === "KeyboardAvoidingView");
  assert.equal(avoiding.props.behavior, "padding");
  assert.equal(avoiding.props.onLayout, undefined);
  assert.equal(
    nodes(tree).find((n) => n.props.style?.paddingBottom === 16).props.style.maxHeight,
    688,
  );
});

test("Android 입력 모달만 긴 신고·폴더 폼을 스크롤하고 iOS 구조는 유지한다", () => {
  for (const os of ["android", "ios"]) {
    const tree = setup("components/modal/Modal.tsx", os)({ isKeyboardAvoiding: true });
    const scroll = nodes(tree).find((n) => n.type === "ScrollView");
    if (os === "android") {
      assert.equal(scroll.props.keyboardShouldPersistTaps, "handled");
      assert.equal(scroll.props.style.flexShrink, 1);
      assert.ok(nodes(tree).some((n) => n.props.style?.maxHeight === "100%"));
    } else assert.equal(scroll, undefined);
  }
});
