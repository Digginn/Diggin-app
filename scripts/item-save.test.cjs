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

const LOGIN_SOURCES = {
  "@/lib/loginIntent": "../src/lib/loginIntent.ts",
  "@/hooks/useLoginGate": "../src/hooks/useLoginGate.tsx",
};

function load(file, mocks) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) =>
        mocks[name] ??
        (name.startsWith("@/assets/")
          ? name
          : LOGIN_SOURCES[name]
            ? load(LOGIN_SOURCES[name], mocks)
            : require(name)),
    },
  );
  return module.exports;
}

test("아이템명이 비면 바로 오류를 띄우고 저장을 막으며, 가격은 선택값이고 숫자만 저장한다", async () => {
  const state = [];
  const submittingRef = { current: false };
  let cursor = 0;
  const saved = [];
  const mocks = {
    "react": {
      useRef: (initial) => (initial === false ? submittingRef : { current: initial }),
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
    "@/utils/formatPriceInput": load("../src/utils/formatPriceInput.ts", {}),
  };
  mocks["@/components/ItemInfoFields"] = load("../src/components/ItemInfoFields.tsx", mocks);
  const { ItemEditSheet } = load("../src/screens/item-detail/components/ItemEditSheet.tsx", mocks);

  const render = (props = {}) => {
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
        ...props,
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
  await saveButton().props.onPress();
  assert.equal(saved.at(-1).price, "", "빈 가격은 빈 값으로 넘겨 null로 저장한다");

  priceField().props.onChangeText("70,000원");
  assert.equal(priceField().props.value, "70,000", "숫자만 남기고 쉼표를 찍는다");
  await saveButton().props.onPress();
  assert.equal(saved.at(-1).price, "70000", "저장 값은 쉼표 없는 숫자다");

  priceField().props.onChangeText("0");
  await saveButton().props.onPress();
  assert.equal(saved.at(-1).price, "0");

  // DB가 거절하는 길이·범위는 입력 단계에서 막는다.
  priceField().props.onChangeText("12345678901");
  await saveButton().props.onPress();
  assert.equal(saved.at(-1).price, "123456789", "정수 범위를 넘지 않게 9자리까지만 받는다");
  assert.equal(nameField().props.maxLength, 100);
  const brandField = render().find((node) => node.props.placeholder === "선택 입력");
  assert.equal(brandField.props.maxLength, 30);

  // 저장 응답 전 연타와 취소·끌어내리기는 막고, 끝나면 풀린다. 실패해도 풀린다.
  let submitCount = 0;
  let closeCount = 0;
  let finishSave;
  const saving = {
    onSubmit: () => {
      submitCount += 1;
      return new Promise((resolve) => {
        finishSave = resolve;
      });
    },
    onRequestClose: () => {
      closeCount += 1;
    },
  };
  const button = (tree, label) =>
    tree.find((node) => node.type === "Button" && node.props.children === label);
  let tree = render(saving);
  const submitting = button(tree, "저장하기").props.onPress();
  button(tree, "저장하기").props.onPress();
  button(tree, "취소").props.onPress();
  tree[0].props.onRequestClose();
  assert.equal(submitCount, 1);
  assert.equal(closeCount, 0);
  finishSave();
  await submitting;
  button(render(saving), "취소").props.onPress();
  assert.equal(closeCount, 1);
  await button(
    render({ onSubmit: () => Promise.reject(new Error("fail")) }),
    "저장하기",
  ).props.onPress();
  assert.equal(submittingRef.current, false);
  tree = render({ isSubmitting: true });
  assert.equal(tree[0].props.isCloseConfirmed, true);
  assert.equal(button(tree, "취소").props.isDisabled, true);
  assert.equal(button(tree, "저장하기").props.isDisabled, true);

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
    "@/components/app-bar/NotificationButton": { NotificationButton: "NotificationButton" },
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
    "@/components/ItemInfoFields": { ItemInfoFields: "ItemInfoFields" },
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

test("저장 후 ALL로 오면 정렬·위시레벨 필터를 되돌리고 목록을 맨 위부터 다시 그린다", () => {
  const state = [];
  let cursor = 0;
  let params = {};
  const listArgs = [];
  const { AllScreen } = load("../src/screens/all/AllScreen.tsx", {
    "react": {
      useCallback: (callback) => callback,
      useLayoutEffect: () => {},
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
    "react-native": { Platform: { OS: "ios" }, Pressable: "Pressable", Text: "Text", View: "View" },
    "expo-router": {
      useLocalSearchParams: () => params,
      useNavigation: () => ({ setOptions: () => {} }),
      useRouter: () => ({ push: () => {} }),
    },
    "@/assets/images/appbar": { IconNotification: "IconNotification", IconSearch: "IconSearch" },
    "@/components/app-bar": { AppBar: Object.assign(() => null, { IconButton: "IconButton" }) },
    "@/components/app-bar/NotificationButton": { NotificationButton: "NotificationButton" },
    "@/components/EmptyState": { EmptyState: "EmptyState" },
    "@/components/ErrorState": { ErrorState: "ErrorState" },
    "@/components/FirstVisitGuide": { FirstVisitGuide: "FirstVisitGuide" },
    "@/components/ItemSaveFlow": { ItemSaveFlow: "ItemSaveFlow" },
    "@/components/modal": { ActionModal: "ActionModal", LoginRequiredModal: "LoginRequiredModal" },
    "@/contexts/AuthContext": { useAuth: () => ({ session: { user: { id: "u" } } }) },
    "@/components/WishItemGrid": { WishItemGrid: "WishItemGrid" },
    "@/components/WishLevel": { WishLevel: "WishLevel" },
    "@/constants/messages": {
      selectDeletedMessage: () => "",
      STATE_MESSAGES: {},
      TOAST_MESSAGES: {},
    },
    "@/hooks/useFirstVisitGuide": { useFirstVisitGuide: () => ({ isVisible: false }) },
    "@/hooks/useItemSave": { useItemSave: () => ({ start: () => {} }) },
    "@/hooks/useLinkDetectionPause": { useLinkDetectionPause: () => {} },
    "@/hooks/useProductCounts": {
      useProductCounts: () => ({
        isPending: false,
        data: { total: 1, levels: { high: 0, medium: 0, low: 0 } },
      }),
    },
    "@/hooks/useProductList": {
      useProductList: (sortOrder, wishLevel) => {
        listArgs.push([sortOrder, wishLevel]);
        return { isPending: false, data: { pages: [[{ id: "1", name: "아이템", price: 0 }]] } };
      },
    },
    "@/hooks/useToast": { useToast: () => () => {} },
    "@/screens/save/components/ItemLinkSheet": { ItemLinkSheet: "ItemLinkSheet" },
    "./components/DeleteBar": { DeleteBar: "DeleteBar" },
    "./components/SelectModeBar": { SelectModeBar: "SelectModeBar" },
    "./components/SortLabel": { SortLabel: "SortLabel" },
    "./mutations/useDeleteProducts": { useDeleteProducts: () => ({}) },
  });
  const render = () => {
    cursor = 0;
    return nodes(AllScreen()).find((node) => node.type === "WishItemGrid");
  };
  const header = (grid, type) => nodes(grid.props.header).find((node) => node.type === type);

  let grid = render();
  header(grid, "SortLabel").props.onChange("oldest");
  header(grid, "WishLevel").props.onSelect("high");
  render();
  assert.deepEqual(listArgs.at(-1), ["oldest", "high"]);

  params = { savedAt: "1" };
  // React는 렌더 중 상태를 바꾸면 바로 다시 그린다.
  render();
  grid = render();
  assert.deepEqual(listArgs.at(-1), ["latest", null]);
  assert.equal(grid.key, ".$1", "저장마다 목록을 새로 그려 맨 위부터 보인다");

  header(grid, "SortLabel").props.onChange("oldest");
  render();
  assert.deepEqual(listArgs.at(-1), ["oldest", null], "같은 저장 신호로는 다시 되돌리지 않는다");
});

test("비회원 ALL은 개인 목록을 조회하지 않고 빈 상태를 보이며, 아이템 추가는 로그인 후 이어 연다", () => {
  const state = [];
  let cursor = 0;
  const enabled = [];
  const routes = [];
  const loginIntent = load("../src/lib/loginIntent.ts", {});
  const { AllScreen } = load("../src/screens/all/AllScreen.tsx", {
    "react": {
      useCallback: (callback) => callback,
      useLayoutEffect: () => {},
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
    "react-native": { Platform: { OS: "ios" }, Pressable: "Pressable", Text: "Text", View: "View" },
    "expo-router": {
      useLocalSearchParams: () => ({}),
      useNavigation: () => ({ setOptions: () => {} }),
      useRouter: () => ({ push: (route) => routes.push(route) }),
    },
    "@/assets/images/appbar": { IconNotification: "IconNotification", IconSearch: "IconSearch" },
    "@/components/app-bar/NotificationButton": { NotificationButton: "NotificationButton" },
    "@/components/app-bar": { AppBar: Object.assign(() => null, { IconButton: "IconButton" }) },
    "@/components/EmptyState": { EmptyState: "EmptyState" },
    "@/components/ErrorState": { ErrorState: "ErrorState" },
    "@/components/FirstVisitGuide": { FirstVisitGuide: "FirstVisitGuide" },
    "@/components/ItemSaveFlow": { ItemSaveFlow: "ItemSaveFlow" },
    "@/components/modal": { ActionModal: "ActionModal", LoginRequiredModal: "LoginRequiredModal" },
    "@/contexts/AuthContext": { useAuth: () => ({ session: null }) },
    "@/lib/loginIntent": loginIntent,
    "@/components/WishItemGrid": { WishItemGrid: "WishItemGrid" },
    "@/components/WishLevel": { WishLevel: "WishLevel" },
    "@/constants/messages": {
      selectDeletedMessage: () => "",
      STATE_MESSAGES: { allEmpty: "빈 ALL" },
      TOAST_MESSAGES: {},
    },
    "@/hooks/useFirstVisitGuide": { useFirstVisitGuide: () => ({ isVisible: false }) },
    "@/hooks/useItemSave": { useItemSave: () => ({ start: () => {} }) },
    "@/hooks/useLinkDetectionPause": { useLinkDetectionPause: () => {} },
    "@/hooks/useProductCounts": {
      useProductCounts: (_query, isEnabled) => {
        enabled.push(isEnabled);
        return { isPending: true, isError: false };
      },
    },
    "@/hooks/useProductList": {
      useProductList: (_sort, _level, _query, isEnabled) => {
        enabled.push(isEnabled);
        return { isPending: true, isError: false };
      },
    },
    "@/hooks/useToast": { useToast: () => () => {} },
    "@/screens/save/components/ItemLinkSheet": { ItemLinkSheet: "ItemLinkSheet" },
    "./components/DeleteBar": { DeleteBar: "DeleteBar" },
    "./components/SelectModeBar": { SelectModeBar: "SelectModeBar" },
    "./components/SortLabel": { SortLabel: "SortLabel" },
    "./mutations/useDeleteProducts": { useDeleteProducts: () => ({}) },
  });
  const render = () => {
    cursor = 0;
    return nodes(AllScreen());
  };
  const tree = render();
  assert.deepEqual(enabled, [false, false], "비회원은 상품을 조회하지 않는다");
  assert.equal(tree.find((node) => node.type === "EmptyState").props.message, "빈 ALL");
  assert.ok(!tree.some((node) => node.type === "ErrorState"));

  tree.find((node) => node.props.accessibilityLabel === "아이템 추가").props.onPress();
  const sheet = () => render().find((node) => node.type === "ItemLinkSheet");
  const modal = () => render().find((node) => node.type === "LoginRequiredModal");
  assert.equal(sheet().props.visible, false, "비회원은 링크 시트를 열지 않는다");
  assert.equal(modal().props.visible, true);
  modal().props.onLogin();
  assert.deepEqual(routes, ["/login"]);
  assert.equal(modal().props.visible, false);
  loginIntent.takeLoginIntent()();
  assert.equal(sheet().props.visible, true, "로그인하면 아이템 추가를 이어 연다");
});
