/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

const source = readFileSync(path.join(__dirname, "../src/screens/folder/FolderScreen.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const screenModule = { exports: {} };
let screenState;
let screenCursor = 0;
let toastTimer;
let toastTimerDuration;
runInNewContext(compiled, {
  exports: screenModule.exports,
  module: screenModule,
  setTimeout: (callback, duration) => {
    toastTimer = callback;
    toastTimerDuration = duration;
    return 1;
  },
  clearTimeout: () => {},
  require: (name) => {
    if (name === "react-native") {
      return {
        Pressable: "Pressable",
        ScrollView: "ScrollView",
        Text: "Text",
        View: "View",
        Keyboard: { dismiss: () => {} },
        useWindowDimensions: () => ({ height: 812 }),
      };
    }
    if (name === "react/jsx-runtime") return require(name);
    if (name === "react")
      return {
        ...React,
        useRef: (initial) => ({ current: initial }),
        useEffect: (callback) => {
          if (screenState) callback();
        },
        useState: (value) => {
          if (!screenState) return [value, () => {}];
          const index = screenCursor++;
          if (screenState[index] === undefined) screenState[index] = value;
          return [
            screenState[index],
            (next) => {
              screenState[index] = next;
            },
          ];
        },
      };
    if (name === "clsx") return require(name);
    if (name.endsWith("FolderCard")) return { FolderCard: "FolderCard" };
    if (name.endsWith("FolderNameModal")) return { FolderNameModal: "FolderNameModal" };
    if (name.endsWith("FolderMenu")) return { FolderMenu: "FolderMenu" };
    if (name.endsWith("FolderToast")) return { FolderToast: "FolderToast" };
    if (name.endsWith("FolderSortFilter")) return { FolderSortFilter: "FolderSortFilter" };
    if (name.endsWith("/modal")) return { ActionModal: "ActionModal" };
    if (name.endsWith("/Chip")) return { Chip: "Chip" };
    if (name.endsWith("/Button")) return { Button: "Button" };
    if (name.endsWith("/app-bar"))
      return { AppBar: Object.assign(() => null, { IconButton: "IconButton" }) };
    if (name === "expo-status-bar") return { StatusBar: "StatusBar" };
    return { default: name };
  },
});

test("폴더 생성 완료 토스트는 모달 닫힌 뒤 표시되고 2초 후 사라진다", async () => {
  screenState = [];
  let submitted;
  const render = () => {
    screenCursor = 0;
    return screenModule.exports.FolderScreen({
      onCreateFolder: (name) => {
        submitted = name;
      },
    });
  };
  const hasToast = (tree) =>
    findAll(tree, "FolderToast").some((toast) => toast.props.message === "폴더가 생성되었습니다.");
  try {
    let tree = render();
    assert.equal(hasToast(tree), false);
    findAll(tree, "Pressable")[0].props.onPress();
    tree = render();
    const modal = findAll(tree, "FolderNameModal")[0];
    await modal.props.onSubmit("여행");
    assert.equal(submitted, "여행");
    assert.equal(hasToast(render()), false);
    modal.props.onClose();
    tree = render();
    assert.equal(findAll(tree, "FolderNameModal").length, 0);
    assert.equal(hasToast(tree), true);
    assert.equal(toastTimerDuration, 2000);
    toastTimer();
    assert.equal(hasToast(render()), false);
  } finally {
    screenState = undefined;
  }
});

test("삭제 메뉴는 확인 모달을 열고 취소는 삭제하지 않으며 확인한 폴더만 콜백으로 전달한다", async () => {
  screenState = [];
  const calls = [];
  const folder = { id: "test", name: "테스트", itemCount: 0 };
  const render = () => {
    screenCursor = 0;
    return screenModule.exports.FolderScreen({
      folders: [folder],
      onDeleteFolder: (selected) => calls.push(selected),
    });
  };
  const openDelete = () => {
    findAll(render(), "FolderCard")[0].props.onPressMenu({
      x: 24,
      y: 200,
      width: 155,
      height: 150,
    });
    const menu = findAll(render(), "FolderMenu")[0];
    menu.props.onClose();
    menu.props.onDelete();
    return findAll(render(), "ActionModal")[0];
  };
  try {
    let modal = openDelete();
    assert.equal(calls.length, 0);
    assert.equal(modal.props.type, "2Btn");
    assert.equal(modal.props.onClose, undefined);
    assert.equal(modal.props.title, "폴더 삭제하기");
    assert.equal(modal.props.primaryAction.label, "취소");
    assert.equal(modal.props.secondaryAction.label, "삭제하기");
    modal.props.primaryAction.onPress();
    assert.equal(calls.length, 0);
    assert.equal(findAll(render(), "ActionModal").length, 0);
    modal = openDelete();
    await modal.props.secondaryAction.onPress();
    assert.deepEqual(calls, [folder]);
    assert.equal(findAll(render(), "ActionModal").length, 0);
  } finally {
    screenState = undefined;
  }
});

test("폴더 메뉴는 화면 경계 안에 열리고 동작 전에 닫힌다", () => {
  const loaded = { exports: {} };
  const code = ts.transpileModule(
    readFileSync(path.join(__dirname, "../src/screens/folder/components/FolderMenu.tsx"), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText;
  runInNewContext(code, {
    exports: loaded.exports,
    module: loaded,
    require: (name) =>
      name === "react-native"
        ? {
            Modal: "Modal",
            Pressable: "Pressable",
            Text: "Text",
            View: "View",
            useWindowDimensions: () => ({ width: 375, height: 812 }),
          }
        : name.endsWith(".svg")
          ? { default: name }
          : require(name),
  });
  const events = [];
  const tree = loaded.exports.FolderMenu({
    anchor: { x: 300, y: 780, width: 90, height: 120 },
    onClose: () => events.push("close"),
    onEdit: () => events.push("edit"),
    onDelete: () => events.push("delete"),
  });
  const menu = findAll(tree, "View").find((view) => view.props.style);
  assert.equal(menu.props.style.left, 259);
  assert.equal(menu.props.style.top, 692);
  const buttons = findAll(tree, "Pressable");
  buttons[1].props.onPress();
  buttons[2].props.onPress();
  buttons[0].props.onPress();
  assert.deepEqual(events, ["close", "edit", "close", "delete", "close"]);
});

test("생성·수정·삭제의 성공과 실패에 맞는 토스트를 표시하고 실패한 모달은 유지한다", async () => {
  const messages = {
    create: ["폴더가 생성되었습니다.", "폴더를 생성하지 못했습니다. 다시 시도해 주세요."],
    rename: ["폴더 이름이 변경되었습니다.", "폴더 이름을 변경하지 못했습니다. 다시 시도해 주세요."],
    delete: ["폴더가 삭제되었습니다.", "폴더를 삭제하지 못했습니다. 다시 시도해 주세요."],
  };
  for (const action of Object.keys(messages)) {
    for (const isFailure of [false, true]) {
      screenState = [];
      const callback = async () => {
        if (isFailure) throw new Error("미리보기 실패");
      };
      const render = () => {
        screenCursor = 0;
        return screenModule.exports.FolderScreen({
          onCreateFolder: callback,
          onRenameFolder: callback,
          onDeleteFolder: callback,
        });
      };
      try {
        if (action === "create") findAll(render(), "Pressable")[0].props.onPress();
        else {
          findAll(render(), "FolderCard")[0].props.onPressMenu({
            x: 24,
            y: 200,
            width: 100,
            height: 100,
          });
          const menu = findAll(render(), "FolderMenu")[0];
          menu.props.onClose();
          menu.props[action === "rename" ? "onEdit" : "onDelete"]();
        }
        const modalType = action === "delete" ? "ActionModal" : "FolderNameModal";
        const modal = findAll(render(), modalType)[0];
        if (action === "delete") await modal.props.secondaryAction.onPress();
        else {
          const result = await modal.props.onSubmit("여행");
          assert.equal(result, !isFailure);
          if (result) modal.props.onClose();
        }
        const tree = render();
        const remainingModal = findAll(tree, modalType)[0];
        assert.equal(!!remainingModal, isFailure);
        // Native Modal이 열린 동안은 동일한 토스트를 overlay로 렌더링한다.
        const toast = findAll(isFailure ? remainingModal.props.overlay : tree, "FolderToast")[0];
        assert.equal(toast.props.message, messages[action][Number(isFailure)]);
        assert.equal(toastTimerDuration, 2000);
        toastTimer();
        const next = render();
        assert.equal(findAll(next, "FolderToast").length, 0);
        if (isFailure) assert.equal(findAll(next, modalType)[0].props.overlay, undefined);
      } finally {
        screenState = undefined;
      }
    }
  }
});

test("6개까지 2열, 7개부터 3열이며 마지막 행의 빈 칸을 유지한다", () => {
  for (const count of [6, 7, 8, 9]) {
    const columnCount = count < 7 ? 2 : 3;
    const folders = Array.from({ length: count }, (_, index) => ({
      id: String(index),
      name: "폴더",
      itemCount: 0,
    }));
    const tree = screenModule.exports.FolderScreen({ folders });
    const rows = React.Children.toArray(findAll(tree, "ScrollView")[0].props.children);
    assert.equal(rows.length, Math.ceil(count / columnCount));
    assert.equal(findAll(tree, "FolderCard").length, count);
    assert.ok(findAll(tree, "FolderCard").every((card) => card.props.columnCount === columnCount));
    for (const row of rows)
      assert.equal(React.Children.toArray(row.props.children).length, columnCount);
  }
});

test("조회 오류는 기존 목록과 FAB를 숨기고 재시도 콜백을 호출한다", () => {
  let retryCount = 0;
  const tree = screenModule.exports.FolderScreen({
    isError: true,
    onRetry: () => {
      retryCount += 1;
    },
  });
  assert.equal(findAll(tree, "FolderCard").length, 0);
  assert.equal(findAll(tree, "ScrollView").length, 0);
  assert.equal(findAll(tree, "Pressable").length, 0);
  const button = findAll(tree, "Button")[0];
  assert.equal(button.props.children, "다시 시도");
  assert.equal(button.props.isDisabled, false);
  button.props.onPress();
  assert.equal(retryCount, 1);
  assert.equal(
    findAll(screenModule.exports.FolderScreen({ isError: true }), "Button")[0].props.isDisabled,
    true,
  );
});

function findAll(node, type) {
  if (!React.isValidElement(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap((child) => findAll(child, type)),
  ];
}

test("새 폴더 모달은 3/7로 시작하고 공백 제외·이모지 포함 7글자를 제한한다", async () => {
  const state = [];
  let cursor = 0;
  const loaded = { exports: {} };
  const compiledModal = ts.transpileModule(
    readFileSync(
      path.join(__dirname, "../src/screens/folder/components/FolderNameModal.tsx"),
      "utf8",
    ),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText;
  runInNewContext(compiledModal, {
    exports: loaded.exports,
    module: loaded,
    require: (name) => {
      if (name === "react")
        return {
          useRef: () => ({ current: null }),
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
        };
      if (name === "react-native") return { Text: "Text", View: "View" };
      if (name.endsWith("/Field")) return { TextField: "TextField" };
      if (name.endsWith("/modal")) return { ActionModal: "ActionModal" };
      return require(name);
    },
  });
  let submitted;
  let closed = false;
  const render = (props = {}) => {
    cursor = 0;
    return loaded.exports.FolderNameModal({
      ...props,
      onClose: () => {
        closed = true;
      },
      onSubmit: (name) => {
        submitted = name;
        return props.isFailure ? false : undefined;
      },
    });
  };
  let tree = render();
  assert.equal(tree.props.onShow, undefined);
  assert.equal(tree.props.isPrimaryDisabled, true);
  assert.equal(findAll(tree, "TextField")[0].props.value, "새 폴더");
  assert.equal(findAll(tree, "Text").at(-1).props.children.join(""), "3/7");
  findAll(tree, "TextField")[0].props.onChangeText("  가족👨‍👩‍👧‍👦 여행  ");
  tree = render();
  assert.equal(tree.props.isPrimaryDisabled, false);
  assert.equal(findAll(tree, "Text").at(-1).props.children.join(""), "5/7");
  findAll(tree, "TextField")[0].props.onChangeText("12345678");
  tree = render();
  assert.equal(findAll(tree, "TextField")[0].props.value, "  가족👨‍👩‍👧‍👦 여행  ");
  await tree.props.primaryAction.onPress();
  assert.equal(submitted, "가족👨‍👩‍👧‍👦 여행");
  assert.equal(closed, true);
  state.length = 0;
  closed = false;
  tree = render({ initialName: "기존 폴더명" });
  assert.equal(tree.props.title, "이름 수정하기");
  assert.equal(tree.props.primaryAction.label, "수정 완료");
  assert.equal(tree.props.isPrimaryDisabled, false);
  assert.equal(tree.props.keyboardGap, 24);
  assert.equal(tree.props.onShow, undefined);
  assert.equal(findAll(tree, "Text").at(-1).props.children.join(""), "5/7");
  await tree.props.primaryAction.onPress();
  assert.equal(submitted, "기존 폴더명");
  assert.equal(closed, true);
  findAll(tree, "TextField")[0].props.onChangeText("   ");
  tree = render({ initialName: "기존 폴더명" });
  assert.equal(tree.props.isPrimaryDisabled, true);
  findAll(tree, "TextField")[0].props.onChangeText("보존할 이름");
  closed = false;
  tree = render({ initialName: "기존 폴더명", isFailure: true });
  await tree.props.primaryAction.onPress();
  assert.equal(closed, false);
  assert.equal(
    findAll(render({ initialName: "기존 폴더명" }), "TextField")[0].props.value,
    "보존할 이름",
  );
});

test("보기 순은 생성일·가나다·아이템 개수로 정렬하고 선택 및 바깥 탭 시 닫힌다", () => {
  screenState = [];
  const folders = [
    { id: "a", name: "가방", itemCount: 2, createdAt: 10 },
    { id: "b", name: "바지", itemCount: 9, createdAt: 30 },
    { id: "c", name: "나무", itemCount: 1, createdAt: 20 },
  ];
  let selected;
  const render = () => {
    screenCursor = 0;
    return screenModule.exports.FolderScreen({
      folders,
      onSort: (value) => {
        selected = value;
      },
    });
  };
  const ids = (tree) => findAll(tree, "FolderCard").map((card) => card.props.folder.id);
  try {
    let tree = render();
    assert.deepEqual(ids(tree), ["b", "c", "a"]);
    let filter = findAll(tree, "FolderSortFilter")[0];
    assert.equal(filter.props.value, null);
    assert.equal(filter.props.count, 12);
    filter.props.onToggle();
    tree = render();
    assert.equal(findAll(tree, "FolderSortFilter")[0].props.isOpen, true);
    findAll(tree, "Pressable")
      .find((node) => node.props.accessibilityLabel === "보기 순 필터 닫기")
      .props.onPress();
    assert.equal(findAll(render(), "FolderSortFilter")[0].props.isOpen, false);
    for (const [order, expected] of [
      ["name", ["a", "c", "b"]],
      ["item-count", ["b", "a", "c"]],
      ["latest", ["b", "c", "a"]],
    ]) {
      filter = findAll(render(), "FolderSortFilter")[0];
      filter.props.onToggle();
      findAll(render(), "FolderSortFilter")[0].props.onChange(order);
      tree = render();
      assert.deepEqual(ids(tree), expected);
      assert.equal(selected, order);
      assert.equal(findAll(tree, "FolderSortFilter")[0].props.isOpen, false);
    }
    assert.deepEqual(
      folders.map((folder) => folder.id),
      ["a", "b", "c"],
    );
  } finally {
    screenState = undefined;
  }
});

test("폴더 썸네일은 1·2·3장으로 제한되고 소장템과 빈 폴더는 닫힌 이미지를 유지한다", () => {
  function loadComponent(filename, mocks) {
    const loaded = { exports: {} };
    const code = ts.transpileModule(readFileSync(path.join(__dirname, filename), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(code, {
      exports: loaded.exports,
      module: loaded,
      require: (name) =>
        name in mocks
          ? mocks[name]
          : name.endsWith(".svg")
            ? { __esModule: true, default: name }
            : name.endsWith(".png")
              ? name
              : require(name),
    });
    return loaded.exports;
  }
  const mocks = {
    "react": { useRef: () => ({ current: null }), useState: () => [undefined, () => {}] },
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable" },
    "expo-image": { Image: "Image" },
    "nativewind": { cssInterop: (component) => component },
    "@/components/FallbackImg": { FallbackImg: "FallbackImg" },
    "./FolderPreview": { FolderPreview: "FolderPreview" },
  };
  const { FolderCard } = loadComponent("../src/screens/folder/components/FolderCard.tsx", mocks);
  const { FolderPreview } = loadComponent(
    "../src/screens/folder/components/FolderPreview.tsx",
    mocks,
  );
  function thumbnails(tree) {
    return findAll(tree, "View")
      .flatMap((node) => React.Children.toArray(node.props.children))
      .filter((node) => typeof node.type === "function" && node.type.name === "Thumbnail");
  }
  for (const columnCount of [2, 3]) {
    for (const itemCount of [0, 1, 2, 3, 8]) {
      const folder = { id: "test", name: "폴더", itemCount, thumbnails: [101, 102, 103, 104] };
      let tree = FolderCard({ folder, columnCount });
      const preview = findAll(tree, "FolderPreview")[0];
      assert.equal(!!preview, itemCount > 0);
      if (preview) {
        tree = FolderPreview(preview.props);
        const rendered = thumbnails(tree);
        assert.equal(rendered.length, Math.min(itemCount, 3));
        assert.deepEqual(
          rendered.map((node) => node.props.source).sort(),
          [101, 102, 103].slice(0, Math.min(itemCount, 3)),
        );
        assert.equal(
          findAll(
            tree,
            columnCount === 3
              ? "@/assets/images/folder/image-open-folder-small.svg"
              : "@/assets/images/folder/image-open-folder.svg",
          ).length,
          1,
        );
      }
      tree = FolderCard({ folder: { ...folder, isOwnedItems: true }, columnCount });
      assert.equal(findAll(tree, "FolderPreview").length, 0);
      assert.equal(findAll(tree, "Image").length, 1);
    }
    const tree = FolderPreview({ itemCount: 2, isCompact: columnCount === 3 });
    const thumbnail = thumbnails(tree)[0];
    assert.equal(thumbnail.type(thumbnail.props).type, "FallbackImg");
  }
});

test("폴더 목록은 2열로 배치하고 빈 목록은 안내 화면을 표시한다", () => {
  const { FolderScreen } = screenModule.exports;
  const folders = Array.from({ length: 3 }, (_, index) => ({
    id: String(index),
    name: "폴더",
    itemCount: 0,
  }));
  let selected;
  const tree = FolderScreen({
    folders,
    onOpenFolder: (folder) => {
      selected = folder;
    },
  });
  const cards = findAll(tree, "FolderCard");
  assert.equal(cards.length, 3);
  assert.equal(findAll(findAll(tree, "ScrollView")[0], "Chip").length, 0);
  assert.equal(findAll(tree, "FolderSortFilter").length, 1);
  assert.equal(
    findAll(tree, "View").filter((view) => view.props.className === "flex-row gap-gutter").length,
    2,
  );
  cards[2].props.onPress();
  assert.equal(selected, folders[2]);
  const empty = FolderScreen({ folders: [] });
  assert.equal(findAll(empty, "FolderCard").length, 0);
  assert.equal(findAll(empty, "ScrollView").length, 0);
  assert.ok(
    findAll(empty, "Text").some((text) => text.props.children.includes("아직 생성된 폴더")),
  );
});
