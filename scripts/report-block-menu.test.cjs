/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function load(file, mocks) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => mocks[name] ?? (name.endsWith(".svg") ? name : require(name)),
    },
  );
  return module.exports;
}
function nodes(node, type) {
  return React.isValidElement(node)
    ? [
        ...(node.type === type ? [node] : []),
        ...React.Children.toArray(node.props.children).flatMap((c) => nodes(c, type)),
      ]
    : [];
}
const colors = {
  gray: { 400: "#B9B9B9", 500: "#9A9A9A", 900: "#1E1E1E", 1000: "#000000" },
  semantic: { error: "#EB2525" },
};

test("피드 카드의 더보기는 신고·차단을 함께 전달하고 본인·미리보기 카드는 메뉴를 숨긴다", () => {
  const { Post } = load("src/components/Post.tsx", {
    "react-native": { Pressable: "Pressable", Text: "Text", View: "View" },
    "expo-image": { Image: "Image" },
    "nativewind": { cssInterop: (component) => component },
    "@/components/FallbackImg": { FallbackImg: "FallbackImg" },
    "@/components/ProductImg": { ProductImg: "ProductImg" },
    "@/components/ReportBlockMenu": { ReportBlockMenu: "ReportBlockMenu" },
    "@/theme": { colors },
  });
  const props = {
    body: "본문",
    items: [],
    timeLabel: "방금 전",
    authorLabel: "익명",
    commentCount: 0,
  };
  const report = () => {},
    block = () => {};
  const menu = nodes(
    Post({ ...props, onPressReport: report, onPressBlock: block }),
    "ReportBlockMenu",
  )[0];
  assert.equal(menu.props.onReport, report);
  assert.equal(menu.props.onBlock, block);
  assert.equal(nodes(Post(props), "ReportBlockMenu").length, 0);
  assert.equal(
    nodes(
      Post({ ...props, onPressReport: report, onPressBlock: block, isPreview: true }),
      "ReportBlockMenu",
    ).length,
    0,
  );
});

test("신고·차단 메뉴는 92×96, 24 아이콘 영역과 Figma의 색상·구분선을 사용한다", () => {
  const { FloatingToolbar } = load("src/components/FloatingToolbar.tsx", {
    "react-native": { Pressable: "Pressable", Text: "Text", View: "View" },
    "@/theme": { colors },
  });
  const actions = [];
  const tree = FloatingToolbar({
    onReport: () => actions.push("report"),
    onBlock: () => actions.push("block"),
  });
  const rows = nodes(tree, "Pressable");
  assert.equal(rows.length, 2);
  rows.forEach((row) => assert.match(row.props.className, /h-12/));
  assert.deepEqual(
    nodes(tree, "Text").map((n) => n.props.children),
    ["신고하기", "차단하기"],
  );
  assert.match(nodes(tree, "Text")[0].props.className, /text-semantic-error/);
  assert.match(nodes(tree, "Text")[1].props.className, /text-gray-900/);
  assert.equal(nodes(tree, "View").filter((n) => n.props.style?.width === 92).length, 2);
  for (const file of ["icon-report-menu.svg", "icon-block.svg", "icon-report-block-divider.svg"]) {
    const icon = nodes(tree, `@/assets/images/${file}`)[0];
    assert.ok(icon);
    assert.equal(icon.props.width, undefined);
    assert.equal(icon.props.height, undefined);
  }
  let stopped = 0;
  rows.forEach((row) => row.props.onPress({ stopPropagation: () => stopped++ }));
  assert.equal(stopped, 2);
  assert.deepEqual(actions, ["report", "block"]);
});

function menuHarness(
  os,
  viewport = { width: 375, height: 812 },
  anchor = { x: 303, y: 534, width: 48, height: 48 },
  options = {},
) {
  const slots = [];
  let cursor = 0;
  const calls = [];
  const state = (initial) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [
      slots[i],
      (next) => {
        slots[i] = next;
      },
    ];
  };
  const { ReportBlockMenu } = load("src/components/ReportBlockMenu.tsx", {
    "react": { useState: state, useRef: (initial) => state({ current: initial })[0] },
    "react-native": {
      Modal: "Modal",
      Pressable: "Pressable",
      View: "View",
      Platform: { OS: os },
      useWindowDimensions: () => viewport,
    },
    "@/components/FloatingToolbar": { FloatingToolbar: "FloatingToolbar" },
    "@/hooks/useNativeModalVisible": { useNativeModalVisible: (visible) => visible },
    "@/theme": { colors },
  });
  const render = () => {
    cursor = 0;
    return ReportBlockMenu({
      onReport: () => calls.push("report"),
      onBlock: () => calls.push("block"),
      ...options,
    });
  };
  const open = () => {
    const trigger = nodes(render(), "Pressable")[0];
    trigger.props.ref.current = {
      measureInWindow: (callback) => callback(anchor.x, anchor.y, anchor.width, anchor.height),
    };
    let stopped = false;
    trigger.props.onPress({
      stopPropagation: () => {
        stopped = true;
      },
    });
    assert.equal(stopped, true);
  };
  return { render, open, calls };
}

for (const os of ["ios", "android"])
  test(`${os}: 피드 메뉴는 바깥 탭으로 닫고 신고·차단은 한 번만 이어 실행한다`, () => {
    const ui = menuHarness(os);
    ui.open();
    const first = ui.render();
    const placement = nodes(first, "View").find((n) => n.props.style?.left !== undefined).props
      .style;
    assert.deepEqual({ ...placement }, { left: 259, top: 578 });
    const menu = nodes(first, "FloatingToolbar")[0];
    menu.props.onBlock();
    menu.props.onReport();
    if (os === "ios") {
      assert.deepEqual(ui.calls, []);
      assert.equal(nodes(ui.render(), "Modal")[0].props.visible, false);
      nodes(ui.render(), "Modal")[0].props.onDismiss();
      assert.deepEqual(ui.calls, ["block"]);
    } else assert.deepEqual(ui.calls, ["block"]);
    assert.equal(nodes(ui.render(), "Modal").length, 0);

    ui.open();
    nodes(ui.render(), "Pressable")
      .find((n) => n.props.accessibilityLabel === "게시글 메뉴 닫기")
      .props.onPress({ stopPropagation() {} });
    if (os === "ios") nodes(ui.render(), "Modal")[0].props.onDismiss();
    assert.deepEqual(ui.calls, ["block"]);
  });

test("화면 가장자리의 메뉴는 화면 안으로 보정한다", () => {
  const ui = menuHarness(
    "android",
    { width: 320, height: 568 },
    { x: 290, y: 540, width: 48, height: 48 },
  );
  ui.open();
  const placement = nodes(ui.render(), "View").find((n) => n.props.style?.left !== undefined).props
    .style;
  assert.deepEqual({ ...placement }, { left: 212, top: 448 });
});

test("상세 메뉴는 상단 버튼 아래·오른쪽 24 여백에 표시하고 비활성 중에는 열리지 않는다", () => {
  const ui = menuHarness(
    "android",
    { width: 375, height: 812 },
    { x: 327, y: 54, width: 55, height: 52 },
    { placement: "header" },
  );
  ui.open();
  const tree = ui.render();
  const trigger = nodes(tree, "Pressable")[0];
  assert.match(trigger.props.className, /items-center justify-center/);
  const placement = nodes(tree, "View").find((n) => n.props.style?.left !== undefined).props.style;
  assert.deepEqual({ ...placement }, { left: 259, top: 100 });
  const disabled = menuHarness("android", undefined, undefined, {
    placement: "header",
    isDisabled: true,
  });
  disabled.open();
  assert.equal(nodes(disabled.render(), "Pressable")[0].props.disabled, true);
  assert.equal(nodes(disabled.render(), "Modal").length, 0);
});

for (const os of ["ios", "android"])
  test(`${os}: 댓글 메뉴는 가운데 회색 케밥과 오른쪽 24 여백을 쓰고 닫힌 뒤 선택 상태를 해제한다`, () => {
    const changes = [];
    const ui = menuHarness(
      os,
      { width: 375, height: 812 },
      { x: 319, y: 403, width: 48, height: 48 },
      { placement: "comment", onOpenChange: (value) => changes.push(value) },
    );
    ui.open();
    const tree = ui.render();
    assert.match(nodes(tree, "Pressable")[0].props.className, /items-center justify-center/);
    assert.equal(nodes(tree, "Pressable")[0].props.accessibilityLabel, "댓글 메뉴");
    assert.equal(nodes(tree, "@/assets/images/icon-kebab.svg")[0].props.color, colors.gray[500]);
    const placement = nodes(tree, "View").find((node) => node.props.style?.left !== undefined);
    assert.deepEqual({ ...placement.props.style }, { left: 259, top: 445 });
    assert.deepEqual(changes, [true]);
    nodes(tree, "FloatingToolbar")[0].props.onBlock();
    if (os === "ios") {
      assert.deepEqual(changes, [true]);
      nodes(ui.render(), "Modal")[0].props.onDismiss();
    }
    assert.deepEqual(changes, [true, false]);
    assert.deepEqual(ui.calls, ["block"]);
  });

test("댓글은 신고 아이콘 대신 신고·차단 메뉴를 쓰고 메뉴를 연 동안 배경만 강조한다", () => {
  let isOpen = false;
  let keyboardDismissed = 0;
  const { Comment } = load("src/components/Comment.tsx", {
    "react": {
      useRef: () => ({ current: null }),
      useState: () => [isOpen, (value) => (isOpen = value)],
    },
    "react-native": {
      View: "View",
      Text: "Text",
      Pressable: "Pressable",
      Keyboard: { dismiss: () => keyboardDismissed++ },
    },
    "@/components/ReportBlockMenu": { ReportBlockMenu: "ReportBlockMenu" },
    "@/theme": { colors },
    "@/utils/httpLinks": { httpLinkParts: (body) => [{ text: body }] },
  });
  const report = () => {},
    block = () => {};
  const props = {
    author: "디기 1",
    body: "댓글",
    timeLabel: "방금 전",
    onPressReport: report,
    onPressBlock: block,
  };
  const menu = nodes(Comment(props), "ReportBlockMenu")[0];
  assert.equal(menu.props.placement, "comment");
  assert.equal(menu.props.onReport, report);
  assert.equal(menu.props.onBlock, block);
  assert.equal(nodes(Comment(props), "@/assets/images/icon-report.svg").length, 0);
  menu.props.onOpenChange(true);
  assert.equal(keyboardDismissed, 1);
  assert.match(Comment(props).props.className, /bg-gray-50/);
  assert.equal(
    nodes(Comment(props), "View").some((node) => node.props.className?.includes("w-[3px]")),
    false,
  );
  menu.props.onOpenChange(false);
  assert.match(Comment(props).props.className, /bg-gray-0/);
  assert.equal(nodes(Comment({ ...props, isDeleted: true }), "ReportBlockMenu").length, 0);
  const mine = Comment({
    author: "나",
    body: "내 댓글",
    timeLabel: "방금 전",
    onPressMenu: () => {},
  });
  assert.equal(nodes(mine, "ReportBlockMenu").length, 0);
  assert.equal(nodes(mine, "Pressable")[0].props.accessibilityLabel, "댓글 메뉴");
});
