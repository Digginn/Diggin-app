/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function load(filename, mocks) {
  const loaded = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(path.join(__dirname, filename), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(compiled, {
    __DEV__: true,
    exports: loaded.exports,
    module: loaded,
    require: (name) =>
      name in mocks ? mocks[name] : name.endsWith(".svg") ? { default: name } : require(name),
  });
  return loaded.exports;
}

function findAll(node, type) {
  if (!React.isValidElement(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap((child) => findAll(child, type)),
  ];
}

test("폴더 관리 버튼은 1개 이하 배지를 숨기고 100개 이상을 99+로 표시한다", () => {
  const { FolderManageButton } = load(
    "../src/screens/item-detail/components/FolderManageButton.tsx",
    {
      "react-native": { Text: "Text", View: "View" },
      "@/components/Button": { Button: "Button" },
      "@/theme/colors": { colors: { gray: { 0: "#FFFFFF" } } },
    },
  );
  let opened = false;
  const render = (folderCount) =>
    FolderManageButton({
      folderCount,
      onPress: () => {
        opened = true;
      },
    });
  for (const count of [0, 1]) assert.equal(findAll(render(count), "Text").length, 0);
  assert.equal(render(0).props.variant, "primary");
  assert.equal(render(0).props.children[0], "폴더에 추가");
  assert.equal(render(1).props.children[0], "폴더 관리");
  assert.equal(render(1).props.bgColor, "#FFFFFF");
  assert.ok(render(1).props.className.includes("border-gray-900"));
  for (const count of [2, 99, 100, 123]) {
    const tree = render(count);
    assert.equal(findAll(tree, "Text")[0].props.children, count > 99 ? "99+" : count);
    assert.equal(tree.props.accessibilityLabel, `폴더 관리, ${count}개 폴더에 저장됨`);
  }
  render(2).props.onPress();
  assert.equal(opened, true);
});

test("폴더 상세 경로는 누른 아이템 ID로 기존 상세 화면을 연다", () => {
  let destination;
  const route = load("../src/app/folder-detail.tsx", {
    "expo-router": {
      useLocalSearchParams: () => ({ name: "내 폴더" }),
      useRouter: () => ({
        push: (value) => {
          destination = value;
        },
      }),
    },
    "@/screens/folder/FolderDetailScreen": { FolderDetailScreen: "FolderDetailScreen" },
    "@/assets/images/folder/image-item-preview.png": 123,
  });
  const tree = route.default();
  tree.props.onOpenItem({ id: "selected-item", name: "선택한 아이템", price: 0 });
  assert.equal(destination.pathname, "/items/[id]");
  assert.equal(destination.params.id, "selected-item");
});

test("폴더 관리는 소장템을 상단에 구분하고 다중 선택·새 폴더 선택 배경을 유지한다", () => {
  const state = [];
  let cursor = 0;
  let scrollPosition;
  let folders = [
    { id: "gift", name: "선물 리스트" },
    { id: "pants", name: "바지" },
    { id: "owned", name: "나의 소장템", isOwnedItems: true },
  ];
  let completed;
  const { FolderManageSheet } = load(
    "../src/screens/item-detail/components/FolderManageSheet.tsx",
    {
      "react": {
        useRef: () => ({
          current: {
            scrollTo: (value) => {
              scrollPosition = value.y;
            },
          },
        }),
        useState: (initial) => {
          const index = cursor++;
          if (state[index] === undefined) state[index] = initial;
          return [
            state[index],
            (next) => {
              state[index] = typeof next === "function" ? next(state[index]) : next;
            },
          ];
        },
      },
      "react-native": {
        View: "View",
        Text: "Text",
        Pressable: "Pressable",
        ScrollView: "ScrollView",
      },
      "@/components/BottomSheet": { BottomSheet: "BottomSheet" },
      "@/components/Button": { Button: "Button" },
      "@/screens/folder/components/FolderNameModal": { FolderNameModal: "FolderNameModal" },
    },
  );
  const render = () => {
    cursor = 0;
    return FolderManageSheet({
      folders,
      selectedFolderIds: [],
      onClose: () => {},
      onCreateFolder: (name) => {
        const folder = { id: "new", name };
        folders = [folder, ...folders];
        return folder;
      },
      onComplete: (ids) => {
        completed = ids;
      },
    });
  };
  const row = (tree, name) =>
    findAll(tree, "Pressable").find((node) => node.props.accessibilityLabel === name);
  let tree = render();
  const listRows = () => findAll(findAll(tree, "ScrollView")[0], "Pressable");
  assert.equal(listRows()[0].props.accessibilityLabel, "나의 소장템");
  assert.equal(
    findAll(tree, "View").filter((node) => node.props.className === "mt-2 h-px bg-[#E6E6E6]")
      .length,
    1,
  );
  // 폴더 수만큼 자라다 702 에서 멈추고 목록이 스크롤된다.
  assert.equal(tree.props.height, undefined);
  assert.equal(tree.props.maxHeight, 702);
  assert.equal(findAll(tree, "ScrollView")[0].props.className, "grow-0");
  assert.equal(row(tree, "선물 리스트").props.accessibilityState.checked, false);
  assert.equal(row(tree, "나의 소장템").props.accessibilityState.checked, false);
  row(tree, "선물 리스트").props.onPress();
  tree = render();
  assert.ok(row(tree, "선물 리스트").props.className.includes("bg-gray-100"));
  assert.equal(row(tree, "선물 리스트").props.accessibilityState.checked, true);
  row(tree, "바지").props.onPress();
  tree = render();
  assert.equal(row(tree, "바지").props.accessibilityState.checked, true);
  assert.ok(row(tree, "바지").props.className.includes("bg-gray-100"));
  row(tree, "새 폴더 만들기").props.onPress();
  tree = render();
  assert.equal(tree.props.overlay.type, "FolderNameModal");
  tree.props.overlay.props.onClose();
  assert.equal(render().props.overlay, undefined);
  row(render(), "새 폴더 만들기").props.onPress();
  const modal = render().props.overlay;
  assert.equal(modal.props.onSubmit("캠핑"), true);
  modal.props.onClose();
  tree = render();
  assert.equal(tree.props.overlay, undefined);
  assert.equal(listRows()[0].props.accessibilityLabel, "나의 소장템");
  assert.equal(listRows()[1].props.accessibilityLabel, "캠핑");
  assert.equal(row(tree, "캠핑").props.accessibilityState.checked, true);
  assert.ok(row(tree, "캠핑").props.className.includes("bg-gray-100"));
  assert.equal(scrollPosition, 0);
  findAll(tree, "Button")[0].props.onPress();
  assert.deepEqual(Array.from(completed), ["gift", "pants", "new"]);
});

test("폴더 상세는 3열·빈 칸 유지·정렬 전환·카드 콜백과 실패 재시도를 처리한다", () => {
  const state = [];
  let cursor = 0;
  const { FolderDetailScreen } = load("../src/screens/folder/FolderDetailScreen.tsx", {
    "react": {
      useState: (initial) => {
        const index = cursor++;
        if (state[index] === undefined) state[index] = initial;
        return [
          state[index],
          (value) => {
            state[index] = value;
          },
        ];
      },
    },
    "react-native": {
      View: "View",
      Text: "Text",
      Pressable: "Pressable",
      FlatList: "FlatList",
      Keyboard: { dismiss: () => {} },
      useWindowDimensions: () => ({ width: 375, height: 812 }),
    },
    "react-native-safe-area-context": {
      SafeAreaView: "SafeAreaView",
      useSafeAreaInsets: () => ({ top: 50 }),
    },
    "./components/FolderMenu": { FolderMenu: "FolderMenu" },
    "expo-status-bar": { StatusBar: "StatusBar" },
    "@/components/app-bar": {
      AppBar: Object.assign(() => null, { IconButton: "IconButton" }),
      SearchBar: "SearchBar",
    },
    "@/components/Button": { Button: "Button" },
    "@/components/card": { Card: "Card" },
    "@/components/WishLevel": { WishLevel: "WishLevel" },
  });
  const items = Array.from({ length: 4 }, (_, index) => ({
    id: String(index),
    name: "아이템명",
    price: 0,
  }));
  let selected;
  const render = (props = {}) => {
    cursor = 0;
    return FolderDetailScreen({
      folderName: "나의 폴더",
      items,
      onOpenItem: (item) => {
        selected = item;
      },
      ...props,
    });
  };
  let tree = render();
  let list = findAll(tree, "FlatList")[0];
  assert.equal(list.props.numColumns, 3);
  assert.equal(list.props.data.length, 6);
  assert.equal(list.props.data[4], null);
  assert.equal(list.props.data[5], null);
  list.props.renderItem({ item: items[0] }).props.onPress();
  assert.equal(selected, items[0]);
  assert.equal(list.props.renderItem({ item: null }).type, "View");
  findAll(tree, "Pressable")[0].props.onPress();
  tree = render();
  list = findAll(tree, "FlatList")[0];
  assert.equal(list.props.data[0], items[3]);
  assert.ok(findAll(tree, "Text").some((node) => node.props.children === "오래된 순"));
  let retried = false;
  tree = render({
    isError: true,
    onRetry: () => {
      retried = true;
    },
  });
  assert.equal(findAll(tree, "FlatList").length, 0);
  assert.equal(findAll(tree, "WishLevel").length, 0);
  findAll(tree, "Button")[0].props.onPress();
  assert.equal(retried, true);
  assert.equal(findAll(render({ isError: true }), "Button")[0].props.isDisabled, true);
  tree = render();
  const appBar = React.Children.toArray(tree.props.children).find(
    (node) => node.props.isTitleLeftAligned,
  );
  const headerButtons = React.Children.toArray(appBar.props.right.props.children);
  assert.equal(headerButtons.length, 2);
  assert.equal(headerButtons[1].props.accessibilityLabel, "폴더 상세 더보기");
  assert.equal(headerButtons[1].props.iconSize, 16);
  let menuOpened = false;
  const menuAppBar = React.Children.toArray(
    render({
      onPressMenu: () => {
        menuOpened = true;
      },
    }).props.children,
  ).find((node) => node.props.isTitleLeftAligned);
  React.Children.toArray(menuAppBar.props.right.props.children)[1].props.onPress();
  assert.equal(menuOpened, true);
  let edited = false;
  let deleted = false;
  const menu = findAll(
    render({
      onEditFolder: () => {
        edited = true;
      },
      onDeleteFolder: () => {
        deleted = true;
      },
    }),
    "FolderMenu",
  )[0];
  assert.equal(menu.props.placement, "header");
  assert.equal(menu.props.anchor.x, 311);
  assert.equal(menu.props.anchor.y, 50);
  menu.props.onEdit();
  menu.props.onDelete();
  assert.equal(edited, true);
  assert.equal(deleted, true);
  menu.props.onClose();
  assert.equal(findAll(render(), "FolderMenu").length, 0);
  headerButtons[0].props.onPress();
  tree = render();
  const searchBar = findAll(tree, "SearchBar")[0];
  assert.equal(searchBar.props.placeholder, "찾고 싶은 아이템을 입력하세요");
  assert.equal(searchBar.props.autoFocus, undefined);
  assert.equal(findAll(tree, "FlatList")[0].props.data[0], items[3]);
  searchBar.props.onChangeText("검색어");
  assert.equal(findAll(render(), "SearchBar")[0].props.value, "검색어");
  searchBar.props.onBack();
  assert.equal(findAll(render(), "SearchBar").length, 0);
  assert.ok(
    findAll(render({ savedItemCount: 1234 }), "Text").some(
      (node) => React.Children.toArray(node.props.children).join("") === "저장한 아이템 1,234개",
    ),
  );
  headerButtons[0].props.onPress();
  const searchItems = [
    { ...items[0], name: "Real Good Pants 엄청 좋은 바지" },
    { ...items[1], brand: "Good brand" },
    items[2],
  ];
  const renderSearch = () => render({ items: searchItems });
  let bar = findAll(renderSearch(), "SearchBar")[0];
  bar.props.onChangeText(" GOOD ");
  bar = findAll(renderSearch(), "SearchBar")[0];
  bar.props.onSubmitEditing();
  tree = renderSearch();
  assert.equal(findAll(tree, "SearchBar")[0].props.value, "GOOD");
  assert.ok(
    findAll(tree, "Text").some(
      (node) => React.Children.toArray(node.props.children).join("") === "검색된 아이템 2개",
    ),
  );
  assert.equal(findAll(tree, "FlatList")[0].props.data.filter(Boolean).length, 2);
  // 결과 화면의 뒤로가기와 X는 모두 검색 대기 화면으로 복귀한다.
  findAll(tree, "SearchBar")[0].props.onBack();
  tree = renderSearch();
  assert.equal(findAll(tree, "SearchBar")[0].props.value, "");
  assert.equal(findAll(tree, "FlatList")[0].props.data.filter(Boolean).length, 3);
  bar = findAll(tree, "SearchBar")[0];
  bar.props.onChangeText("없는 검색어");
  findAll(renderSearch(), "SearchBar")[0].props.onSubmitEditing();
  assert.equal(findAll(renderSearch(), "FlatList")[0].props.data.length, 0);
  findAll(renderSearch(), "SearchBar")[0].props.onClear();
  assert.equal(findAll(renderSearch(), "FlatList")[0].props.data.filter(Boolean).length, 3);
  findAll(renderSearch(), "SearchBar")[0].props.onChangeText("   ");
  findAll(renderSearch(), "SearchBar")[0].props.onSubmitEditing();
  assert.equal(findAll(renderSearch(), "FlatList")[0].props.data.filter(Boolean).length, 3);
});

test("공용 Card는 가격 없음과 0원을 구분하고 로컬 썸네일을 표시한다", () => {
  const { Card } = load("../src/components/card/Card.tsx", {
    "react": { useState: () => [undefined, () => {}] },
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable" },
    "expo-image": { Image: "Image" },
    "nativewind": { cssInterop: (value) => value },
    "@/components/FallbackImg": { FallbackImg: "FallbackImg" },
  });
  let tree = Card({ name: "아이템명", price: null });
  let labels = findAll(tree, "Text").map((node) => node.props.children);
  assert.ok(labels.includes("가격 정보 없음"));
  assert.equal(labels.includes("원"), false);
  tree = Card({ name: "아이템명", price: 0, thumbnailSource: 123 });
  labels = findAll(tree, "Text").map((node) => node.props.children);
  assert.ok(labels.includes("0"));
  assert.ok(labels.includes("원"));
  assert.equal(findAll(tree, "Image")[0].props.source, 123);
  const onPress = () => {};
  tree = Card({
    name: "선택된 아이템",
    price: 0,
    thumbnailSource: 123,
    select: "selected",
    onPress,
  });
  assert.equal(tree.props.accessibilityRole, "checkbox");
  assert.equal(tree.props.accessibilityState.checked, true);
  assert.equal(tree.props.onPress, onPress);
  assert.equal(findAll(tree, "Image")[0].props.source, 123);
  assert.ok(findAll(tree, "View").some((node) => node.props.className.includes("bg-gray-1000/15")));
  tree = Card({ name: "선택되지 않은 아이템", price: 0, select: "unselected", onPress });
  assert.equal(tree.props.accessibilityState.checked, false);
  assert.ok(
    findAll(tree, "View").some(
      (node) => node.props.className === "h-3 w-full flex-row items-center",
    ),
  );
  tree = Card({ name: "아이템명", price: "000,000" });
  assert.ok(findAll(tree, "Text").some((node) => node.props.children === "000,000"));
  tree = Card({
    name: "아주 긴 아이템명이 한 줄을 초과할 때",
    price: 1234567890,
    brand: "Maison Lune Atelier Seoul Studio",
  });
  const texts = findAll(tree, "Text");
  for (const text of [texts[0], texts[2], texts[3]]) {
    assert.equal(text.props.numberOfLines, 1);
    assert.equal(text.props.ellipsizeMode, "tail");
  }
  assert.ok(texts[0].props.className.includes("max-w-[94px]"));
  assert.ok(texts[0].props.className.includes("shrink"));
  assert.equal(texts[0].props.children, "1,234,567,890");
  assert.equal(texts[1].props.children, "원");
});
