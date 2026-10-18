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
  // 화면을 나눈 컴포넌트(ItemInfoFields 등)도 펼쳐서 안쪽 입력 칸까지 본다.
  if (typeof node.type === "function") return [node, ...nodes(node.type(node.props))];
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

test("아이템명이 비면 바로 오류를 띄우고 저장을 막으며, 가격은 선택값이고 숫자만 저장한다", () => {
  const state = [];
  let cursor = 0;
  const saved = [];
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
    "nativewind": { cssInterop: (component) => component },
    "@/components/BottomSheet": { BottomSheet: "BottomSheet" },
    "@/components/Button": { Button: "Button" },
    "@/components/Field": { TextField: "TextField" },
    "@/components/modal": { ActionModal: "ActionModal" },
    "@/components/Tooltip": { Tooltip: "Tooltip" },
    "@/hooks/useNativeModalVisible": { useNativeModalVisible: (visible) => visible },
    "@/components/WishLevelSelect": { WishLevelSelect: "WishLevelSelect" },
    "../utils/formatPriceInput": load("../src/screens/item-detail/utils/formatPriceInput.ts", {}),
  };
  mocks["./ItemInfoFields"] = load(
    "../src/screens/item-detail/components/ItemInfoFields.tsx",
    mocks,
  );
  const { ItemEditSheet } = load("../src/screens/item-detail/components/ItemEditSheet.tsx", mocks);

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

  // SAVE-005 가격은 선택값이라 비어 있어도 저장할 수 있고 null로 넘어간다.
  assert.ok(!priceField().props.isError, "가격이 비어도 오류가 아니다");
  assert.equal(requiredCount(), 0);
  assert.equal(saveButton().props.isDisabled, false);
  saveButton().props.onPress();
  assert.equal(saved.at(-1).price, "", "빈 가격은 빈 값으로 넘겨 null로 저장한다");

  priceField().props.onChangeText("70,000원");
  assert.equal(priceField().props.value, "70,000", "숫자만 남기고 쉼표를 찍는다");
  saveButton().props.onPress();
  assert.equal(saved.at(-1).price, "70000", "저장 값은 쉼표 없는 숫자다");

  priceField().props.onChangeText("0");
  saveButton().props.onPress();
  assert.equal(saved.at(-1).price, "0");

  nameField().props.onChangeText("   ");
  assert.equal(nameField().props.isError, true, "공백만 있는 아이템명은 빈 값이다");
  assert.equal(requiredCount(), 1);
  assert.equal(saveButton().props.isDisabled, true);
});

test("폴더 선택하기는 폴더 목록이 없으면 다시 불러오고, 그래도 없으면 시트 대신 안내를 띄운다", async () => {
  const state = [];
  let cursor = 0;
  let folders;
  let refetchResult;
  const { ItemSavePage } = load("../src/screens/save/components/ItemSavePage.tsx", {
    "react": {
      useEffect: () => {},
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
      Keyboard: { addListener: () => ({ remove() {} }), dismiss() {} },
      KeyboardAvoidingView: "KeyboardAvoidingView",
      Modal: "Modal",
      Platform: { OS: "ios" },
      ScrollView: "ScrollView",
      Text: "Text",
      View: "View",
    },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
    "@/api/products": { findProductIdByUrl: async () => null },
    "@/components/app-bar": { AppBar: "AppBar" },
    "@/components/Button": { Button: "Button" },
    "@/components/modal": { ActionModal: "ActionModal" },
    "@/components/ToastText": { ToastText: "ToastText" },
    "@/constants/messages": { TOAST_MESSAGES: { SYS_001: "연결 확인" } },
    "@/hooks/useCreateFolder": { useCreateFolder: () => ({}) },
    "@/hooks/useFolders": {
      useFolders: () => ({ data: folders, refetch: async () => refetchResult }),
    },
    "@/screens/item-detail/components/FolderManageSheet": {
      FolderManageSheet: "FolderManageSheet",
    },
    "@/screens/item-detail/components/ItemEditSheet": { ITEM_INFO_DESCRIPTION: {} },
    "@/screens/item-detail/components/ItemInfoFields": { ItemInfoFields: "ItemInfoFields" },
  });
  const render = () => {
    cursor = 0;
    return nodes(
      ItemSavePage({
        visible: true,
        initialValues: {
          name: "아이템",
          brand: "",
          price: "",
          sourceUrl: "https://shop.com/p/1",
          thumbnailUrl: null,
          wishLevel: null,
        },
        hasExtractionFailed: false,
        onRequestClose() {},
        onSubmit: async () => {},
        onOpenDuplicate() {},
        isSubmitting: false,
        onErrorDismiss() {},
      }),
    );
  };
  const openSheet = () =>
    render()
      .find((node) => node.type === "Button" && node.props.children === "폴더 선택하기")
      .props.onPress();

  folders = undefined;
  refetchResult = { data: undefined };
  await openSheet();
  let tree = render();
  assert.equal(
    tree.find((node) => node.type === "FolderManageSheet"),
    undefined,
  );
  assert.equal(tree.find((node) => node.type === "ToastText").props.message, "연결 확인");

  refetchResult = { data: [{ id: "1", name: "바지" }] };
  await openSheet();
  folders = refetchResult.data;
  tree = render();
  assert.deepEqual(tree.find((node) => node.type === "FolderManageSheet").props.folders, folders);
});
