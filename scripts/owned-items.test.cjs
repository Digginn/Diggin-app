/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function load(file, mocks = {}) {
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

function nodes(element, type) {
  if (!React.isValidElement(element)) return [];
  return [
    ...(element.type === type ? [element] : []),
    ...React.Children.toArray(element.props.children).flatMap((child) => nodes(child, type)),
  ];
}

test("소장 카드는 썸네일만 흰색 40%로 덮고 배지·선택 체크·클릭을 유지한다", () => {
  const { Card } = load("../src/components/card/Card.tsx", {
    "react": { useState: () => [undefined, () => {}] },
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable" },
    "expo-image": { Image: "Image" },
    "nativewind": { cssInterop: (component) => component },
    "@/components/FallbackImg": { FallbackImg: "FallbackImg" },
  });
  let presses = 0;
  const props = { name: "코트", price: 10, onPress: () => presses++, select: "selected" };
  const tree = Card({ ...props, isOwned: true });
  const dim = nodes(tree, "View").find((node) => node.props.className.includes("bg-gray-0/40"));
  assert.ok(dim.props.className.includes("h-[106px]"));
  assert.equal(dim.props.pointerEvents, "none");
  assert.equal(nodes(tree, "@/assets/images/icon-basket-check-white.svg")[0].props.width, 12);
  assert.equal(nodes(tree, "@/assets/images/icon-select-check-on.svg").length, 1);
  assert.equal(tree.props.accessibilityLabel, "코트, 나의 소장템");
  tree.props.onPress();
  assert.equal(presses, 1);
  assert.equal(nodes(Card(props), "@/assets/images/icon-basket-check-white.svg").length, 0);
});

test("그리드는 소장 여부를 카드에 전달하고, 탭을 다시 누르면 맨 위로 올라가게 연결한다", () => {
  const scrollTargets = [];
  const { WishItemGrid } = load("../src/components/WishItemGrid.tsx", {
    "react": { ...React, useRef: (initial) => ({ current: initial }) },
    "react-native": { FlatList: "FlatList", View: "View" },
    "expo-router": { useScrollToTop: (ref) => scrollTargets.push(ref) },
    "@/components/card": { Card: "Card", CardSkeleton: "CardSkeleton" },
  });
  const item = { id: "owned", name: "코트", price: 1, isOwned: true };
  const tree = WishItemGrid({ items: [item] });
  assert.equal(tree.props.renderItem({ item }).props.isOwned, true);
  assert.equal(scrollTargets.length, 1);
  assert.equal(tree.props.ref, scrollTargets[0], "목록에 붙인 ref로 맨 위로 올린다");
});
