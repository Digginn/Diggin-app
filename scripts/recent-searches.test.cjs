/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function load(file, mocks) {
  const filename = path.resolve(__dirname, file);
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith("."))
        return load(path.resolve(path.dirname(filename), `${name}.ts`), mocks);
      return require(name);
    },
  });
  return module.exports;
}

function nodes(element, type) {
  if (!React.isValidElement(element)) return [];
  return [
    ...(element.type === type ? [element] : []),
    ...React.Children.toArray(element.props.children).flatMap((child) => nodes(child, type)),
  ];
}

test("최근 검색어는 5개·36px 터치 영역·200px 제한·줄바꿈과 전체 검색어 콜백을 유지한다", () => {
  const { RecentSearches } = load("../src/screens/search/components/RecentSearches.tsx", {
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable" },
    "@/components/Tag": { Tag: "Tag" },
  });
  const long = "아주 긴 검색어 ".repeat(10);
  const actions = [];
  const props = {
    keywords: [long, "코트", "운동화", "가방", "무선 이어폰", "제외"],
    onSelect: (word) => actions.push(["select", word]),
    onRemove: (word) => actions.push(["remove", word]),
    onClearAll: () => actions.push(["clear"]),
  };
  const tree = RecentSearches(props);
  assert.equal(nodes(tree, "ScrollView").length, 0);
  assert.ok(nodes(tree, "View").some((node) => node.props.className.includes("flex-wrap")));
  assert.equal(
    nodes(tree, "View").filter((node) => node.props.className.includes("h-9")).length,
    5,
  );
  const tags = nodes(tree, "Tag");
  assert.equal(tags.length, 5);
  assert.equal(tags[0].props.className, "max-w-[200px]");
  assert.equal(tags[0].props.label, long);
  tags[0].props.onPress();
  tags[0].props.onClose();
  nodes(tree, "Pressable")[0].props.onPress();
  assert.deepEqual(actions, [["select", long], ["remove", long], ["clear"]]);
  assert.equal(RecentSearches({ ...props, keywords: [] }), null);
});

test("Tag는 한 줄 말줄임을 적용하고 삭제 아이콘은 줄어들지 않는다", () => {
  const { Tag } = load("../src/components/Tag.tsx", {
    "react-native": { Pressable: "Pressable", Text: "Text" },
    "nativewind": { cssInterop: () => "CloseIcon" },
    "@/assets/images/icon-close.svg": "CloseSvg",
  });
  const tree = Tag({ label: "긴 검색어", className: "max-w-[200px]", onClose() {}, onPress() {} });
  assert.ok(tree.props.className.includes("max-w-[200px]"));
  assert.equal(nodes(tree, "Text")[0].props.numberOfLines, 1);
  assert.equal(nodes(tree, "Text")[0].props.ellipsizeMode, "tail");
  assert.ok(nodes(tree, "Pressable")[1].props.className.includes("shrink-0"));
});

test("기존 검색 기록도 5개·100자로 정리하고 재검색·개별 삭제·전체 삭제를 처리한다", async () => {
  const state = [];
  let cursor = 0;
  let effects;
  const writes = [];
  const { useRecentSearches } = load("../src/screens/search/useRecentSearches.ts", {
    "react": {
      useState(initial) {
        const index = cursor++;
        if (state[index] === undefined) state[index] = initial;
        return [
          state[index],
          (next) => {
            state[index] = typeof next === "function" ? next(state[index]) : next;
          },
        ];
      },
      useEffect(effect) {
        effects.push(effect);
      },
    },
    "@react-native-async-storage/async-storage": {
      getItem: async () =>
        JSON.stringify([
          "가".repeat(105),
          "코트",
          "코트",
          null,
          "",
          "  ",
          "가방",
          "신발",
          "셔츠",
          "제외",
        ]),
      setItem: async (key, value) => writes.push(JSON.parse(value)),
    },
  });
  const render = () => {
    cursor = 0;
    effects = [];
    return useRecentSearches();
  };
  render();
  effects[0]();
  effects[1]();
  assert.equal(writes.length, 0, "기록을 읽기 전에 덮어쓰지 않는다.");
  await new Promise((resolve) => setTimeout(resolve, 0));
  let hook = render();
  assert.deepEqual(Array.from(hook.keywords), ["가".repeat(100), "코트", "가방", "신발", "셔츠"]);
  effects[1]();
  assert.equal(writes[0].length, 5);
  hook.add("신발");
  assert.deepEqual(Array.from(render().keywords), [
    "신발",
    "가".repeat(100),
    "코트",
    "가방",
    "셔츠",
  ]);
  render().add("나".repeat(110));
  assert.equal(render().keywords[0], "나".repeat(100));
  render().remove("코트");
  assert.equal(render().keywords.includes("코트"), false);
  render().clear();
  assert.equal(render().keywords.length, 0);
  render().add("  ");
  assert.equal(render().keywords.length, 0);
});
