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

function load(file, mocks) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => mocks[name] ?? (name.startsWith("@/assets/") ? name : require(name)),
    },
  );
  return module.exports;
}

test("아이템명·가격이 비면 바로 오류를 띄우고 저장을 막으며, 가격은 숫자만 저장한다", () => {
  const state = [];
  let cursor = 0;
  const saved = [];
  const { ItemEditSheet } = load("../src/screens/item-detail/components/ItemEditSheet.tsx", {
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
    "nativewind": { cssInterop: (component) => component },
    "@/components/BottomSheet": { BottomSheet: "BottomSheet" },
    "@/components/Button": { Button: "Button" },
    "@/components/Field": { TextField: "TextField" },
    "@/components/modal": { ActionModal: "ActionModal" },
    "@/components/Tooltip": { Tooltip: "Tooltip" },
    "@/hooks/useNativeModalVisible": { useNativeModalVisible: (visible) => visible },
    "@/components/WishLevelSelect": { WishLevelSelect: "WishLevelSelect" },
    "../utils/formatPriceInput": load("../src/screens/item-detail/utils/formatPriceInput.ts", {}),
  });

  const render = () => {
    cursor = 0;
    return nodes(
      ItemEditSheet({
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
  const nameField = () => render().find((node) => node.props.growsTo === 88);
  const saveButton = () =>
    render().find((node) => node.type === "Button" && node.props.children === "저장하기");
  // 라벨 옆 *필수 정보는 FieldLabel 이 isMissing 일 때 그린다.
  const requiredCount = () => render().filter((node) => node.props.isMissing === true).length;

  assert.equal(priceField().props.isError, true, "가격이 비면 처음부터 오류를 띄운다");
  assert.equal(requiredCount(), 1);
  assert.equal(saveButton().props.isDisabled, true);

  priceField().props.onChangeText("70,000원");
  assert.equal(priceField().props.value, "70,000", "숫자만 남기고 쉼표를 찍는다");
  assert.equal(priceField().props.isError, false);
  assert.equal(saveButton().props.isDisabled, false);
  saveButton().props.onPress();
  assert.equal(saved.at(-1).price, "70000", "저장 값은 쉼표 없는 숫자다");

  priceField().props.onChangeText("0");
  assert.equal(priceField().props.isError, false, "직접 입력한 0원은 허용한다");
  saveButton().props.onPress();
  assert.equal(saved.at(-1).price, "0");

  nameField().props.onChangeText("   ");
  assert.equal(nameField().props.isError, true, "공백만 있는 아이템명은 빈 값이다");
  assert.equal(requiredCount(), 1);
  assert.equal(saveButton().props.isDisabled, true);
});
