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

test("저장 시 가격 오류를 표시하고 유효한 가격으로 수정하면 저장한다", () => {
  const state = [];
  let cursor = 0;
  const saved = [];
  const screen = { exports: {} };
  const mocks = {
    "react": {
      useRef: (initial) => ({ current: initial }),
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
      Modal: "Modal",
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      Text: "Text",
      View: "View",
    },
    "expo-image": { Image: "Image" },
    "expo-image-picker": {},
    "nativewind": { cssInterop: (component) => component },
    "@/components/BottomSheet": { BottomSheet: "BottomSheet" },
    "@/components/Button": { Button: "Button" },
    "@/components/FallbackImg": { FallbackImg: "FallbackImg" },
    "@/components/Field": { TextField: "TextField" },
    "@/components/modal": { ActionModal: "ActionModal" },
    "@/components/Tooltip": { Tooltip: "Tooltip" },
    "@/components/WishLevelSelect": { WishLevelSelect: "WishLevelSelect" },
  };
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        path.join(__dirname, "../src/screens/save/components/ItemSaveSheet.tsx"),
        "utf8",
      ),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      },
    ).outputText,
    {
      module: screen,
      exports: screen.exports,
      require: (name) => mocks[name] ?? (name.startsWith("@/assets/") ? name : require(name)),
    },
  );
  const render = () => {
    cursor = 0;
    return nodes(
      screen.exports.ItemSaveSheet({
        visible: true,
        initialValues: {
          name: "아이템",
          brand: "",
          price: "",
          sourceUrl: "https://example.com",
          thumbnailUrl: null,
          wishLevel: null,
        },
        onSubmit: (values) => saved.push(values),
        onRequestClose() {},
      }),
    );
  };
  const priceField = () => render().find((node) => node.props.keyboardType === "number-pad");
  const save = () =>
    render()
      .find((node) => node.type === "Button" && node.props.children === "저장하기")
      .props.onPress();
  assert.equal(priceField().props.isError, false, "최초에는 오류를 표시하지 않는다");
  for (const price of ["", "0", "-1", "abc", "1e3", "Infinity", "9".repeat(400)]) {
    priceField().props.onChangeText(price);
    save();
    assert.equal(priceField().props.value, price, "입력값을 유지한다");
    assert.equal(priceField().props.isError, true);
    assert.equal(
      render().filter((node) => node.type === "Text" && node.props.children === "*필수 정보")
        .length,
      2,
    );
    assert.equal(saved.length, 0);
  }
  for (const price of ["1", "70000", "70,000원"]) {
    priceField().props.onChangeText(price);
    assert.equal(priceField().props.isError, false, "가격을 수정하면 바로 오류가 해제된다");
    save();
    assert.equal(saved.at(-1).price, price);
  }
});
