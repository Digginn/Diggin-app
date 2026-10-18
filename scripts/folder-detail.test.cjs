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
    setTimeout,
    clearTimeout,
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
    "react": { ...React, useState: (initial) => [initial, () => {}] },
    "@/components/modal": { ActionModal: "ActionModal" },
    "@/hooks/useToast": { useToast: () => () => {} },
    "@/screens/folder/components/FolderNameModal": { FolderNameModal: "FolderNameModal" },
    "@/screens/folder/components/FolderToast": { FolderToast: "FolderToast" },
    "@/screens/folder/constants/folderMessages": { FOLDER_MESSAGES: {} },
    "@/screens/folder/mutations/useDeleteFolder": {
      useDeleteFolder: () => ({ mutate: () => {}, isPending: false }),
    },
    "@/screens/folder/mutations/useRenameFolder": { useRenameFolder: () => ({}) },
    "@/screens/folder/queries/useFolderItems": {
      useFolderItems: () => ({ data: undefined, isError: false }),
    },
    "@/screens/folder/queries/useFolderCounts": { useFolderCounts: () => ({ data: undefined }) },
    "expo-router": {
      useLocalSearchParams: () => ({ id: "3", name: "내 폴더" }),
      useRouter: () => ({
        push: (value) => {
          destination = value;
        },
      }),
    },
    "@/screens/folder/FolderDetailScreen": { FolderDetailScreen: "FolderDetailScreen" },
    "@/assets/images/folder/image-item-preview.png": 123,
  });
  const screen = React.Children.toArray(route.default().props.children).find(
    (node) => node.type === "FolderDetailScreen",
  );
  assert.equal(screen.props.folderName, "내 폴더");
  screen.props.onOpenItem({ id: "selected-item", name: "선택한 아이템", price: 0 });
  assert.equal(destination.pathname, "/items/[id]");
  assert.equal(destination.params.id, "selected-item");
});

test("폴더 관리는 소장템을 상단에 구분하고 다중 선택·새 폴더 선택 배경을 유지한다", async () => {
  const state = [];
  const submittingRef = { current: false };
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
        useRef: (initial) =>
          initial === null
            ? {
                current: {
                  scrollTo: (value) => {
                    scrollPosition = value.y;
                  },
                },
              }
            : submittingRef,
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
      "@/components/modal": { ActionModal: "ActionModal" },
      "@/screens/folder/components/FolderNameModal": { FolderNameModal: "FolderNameModal" },
      "@/screens/folder/components/FolderToast": { FolderToast: "FolderToast" },
      "@/screens/folder/constants/folderMessages": { FOLDER_MESSAGES: {} },
    },
  );
  const render = (props = {}) => {
    cursor = 0;
    return FolderManageSheet({
      ...props,
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
      ...props,
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
  assert.equal(render().props.overlay.props.visible, false);
  row(render(), "새 폴더 만들기").props.onPress();
  const modal = render().props.overlay;
  assert.equal(await modal.props.onSubmit("캠핑"), true);
  modal.props.onClose();
  tree = render();
  assert.equal(tree.props.overlay.props.visible, false);
  assert.equal(listRows()[0].props.accessibilityLabel, "나의 소장템");
  assert.equal(listRows()[1].props.accessibilityLabel, "캠핑");
  assert.equal(row(tree, "캠핑").props.accessibilityState.checked, true);
  assert.ok(row(tree, "캠핑").props.className.includes("bg-gray-100"));
  assert.equal(scrollPosition, 0);
  await findAll(tree, "Button")[0].props.onPress();
  assert.deepEqual(Array.from(completed), ["gift", "pants", "new"]);

  // 저장 응답 전 연타와 닫기는 막고, 끝나면 풀린다. 실패해도 풀린다.
  let saveCount = 0;
  let closeCount = 0;
  let finishSave;
  const saving = {
    onComplete: () => {
      saveCount += 1;
      return new Promise((resolve) => {
        finishSave = resolve;
      });
    },
    onClose: () => {
      closeCount += 1;
    },
  };
  tree = render(saving);
  const submitting = findAll(tree, "Button")[0].props.onPress();
  findAll(tree, "Button")[0].props.onPress();
  tree.props.onRequestClose();
  assert.equal(saveCount, 1);
  assert.equal(closeCount, 0);
  finishSave();
  await submitting;
  render(saving).props.onRequestClose();
  assert.equal(closeCount, 1);
  await findAll(
    render({ onComplete: () => Promise.reject(new Error("fail")) }),
    "Button",
  )[0].props.onPress();
  assert.equal(submittingRef.current, false);

  tree = render({ isCompleting: true, onBack: () => {} });
  assert.equal(tree.props.isCloseConfirmed, true);
  assert.equal(findAll(tree, "Button").length, 2);
  assert.ok(findAll(tree, "Button").every((button) => button.props.isDisabled));
});

test("폴더 상세는 3열·빈 칸 유지·정렬 전환·카드 콜백과 실패 재시도를 처리한다", async () => {
  const state = [];
  let cursor = 0;
  let lastEffect;
  const { FolderDetailScreen } = load("../src/screens/folder/FolderDetailScreen.tsx", {
    "react": {
      useEffect: (effect) => {
        lastEffect = effect;
      },
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
  let sortToggled = false;
  tree = render({
    onToggleSort: () => {
      sortToggled = true;
    },
  });
  findAll(tree, "Pressable")[0].props.onPress();
  assert.equal(sortToggled, true, "정렬은 서버에서 다시 불러오도록 라우트에 알린다");
  tree = render({ isOldestFirst: true });
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
  tree = render({ isOwnedFolder: true });
  const ownedAppBar = React.Children.toArray(tree.props.children).find(
    (node) => node.props.isTitleLeftAligned,
  );
  assert.equal(
    React.Children.toArray(ownedAppBar.props.right.props.children).length,
    1,
    "나의 소장템은 더보기 메뉴를 숨긴다(FLD-004)",
  );
  assert.equal(findAll(tree, "WishLevel").length, 0, "나의 소장템은 위시레벨 필터를 숨긴다");
  assert.equal(
    findAll(tree, "FlatList")[0].props.renderItem({ item: items[0] }).props.hasOwnedDim,
    false,
  );
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
  assert.equal(
    findAll(tree, "FlatList")[0].props.data[0],
    items[0],
    "순서는 받은 그대로 보여 준다",
  );
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
  let submitted;
  const renderSearch = () =>
    render({
      items: searchItems,
      onSubmitSearch: (value) => {
        submitted = value;
      },
    });
  let bar = findAll(renderSearch(), "SearchBar")[0];
  bar.props.onChangeText(" GOOD ");
  bar = findAll(renderSearch(), "SearchBar")[0];
  bar.props.onSubmitEditing();
  tree = renderSearch();
  assert.equal(findAll(tree, "SearchBar")[0].props.value, "GOOD");
  assert.equal(submitted, "GOOD", "검색은 서버에서 찾도록 라우트에 넘긴다");
  assert.ok(
    findAll(tree, "Text").some(
      (node) => React.Children.toArray(node.props.children).join("") === "검색된 아이템 3개",
    ),
  );
  // 결과 화면의 뒤로가기와 X는 모두 검색 대기 화면으로 복귀한다.
  findAll(tree, "SearchBar")[0].props.onBack();
  tree = renderSearch();
  assert.equal(findAll(tree, "SearchBar")[0].props.value, "");
  assert.equal(findAll(tree, "FlatList")[0].props.data.filter(Boolean).length, 3);
  bar = findAll(tree, "SearchBar")[0];
  bar.props.onChangeText("없는 검색어");
  findAll(renderSearch(), "SearchBar")[0].props.onSubmitEditing();
  assert.equal(submitted, "없는 검색어");
  findAll(renderSearch(), "SearchBar")[0].props.onClear();
  assert.equal(submitted, "", "X는 검색을 푼다");
  findAll(renderSearch(), "SearchBar")[0].props.onChangeText("   ");
  findAll(renderSearch(), "SearchBar")[0].props.onSubmitEditing();
  assert.equal(submitted, "", "공백만 입력하면 검색하지 않는다");
  // 입력을 멈추면 검색 버튼 없이도 검색한다(ALL-004와 같은 동작).
  findAll(renderSearch(), "SearchBar")[0].props.onChangeText(" 바지 ");
  renderSearch();
  lastEffect();
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(submitted, "바지");
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
  for (const text of [texts[0], texts[1], texts[3]]) {
    assert.equal(text.props.numberOfLines, 1);
    assert.equal(text.props.ellipsizeMode, "tail");
  }
  assert.equal(texts[0].props.children, "아주 긴 아이템명이 한 줄을 초과할 때");
  assert.ok(texts[0].props.className.includes("font-label-12-regular"));
  assert.ok(texts[1].props.className.includes("max-w-[94px]"));
  assert.ok(texts[1].props.className.includes("shrink"));
  assert.equal(texts[1].props.children, "1,234,567,890");
  assert.equal(texts[2].props.children, "원");
});
