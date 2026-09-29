/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function loadScreen() {
  let activeKey = "posts";
  const screenModule = { exports: {} };
  const source = readFileSync(path.join(__dirname, "../src/screens/my/MyPostsScreen.tsx"), "utf8");
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports: screenModule.exports,
      module: screenModule,
      require: (name) => {
        if (name === "react")
          return {
            ...React,
            useState: () => [activeKey, (key) => (activeKey = key)],
          };
        if (name === "react-native")
          return { FlatList: "FlatList", Pressable: "Pressable", Text: "Text", View: "View" };
        if (name === "expo-image") return { Image: "Image" };
        if (name === "nativewind") return { cssInterop: (component) => component };
        if (name === "react-native-safe-area-context")
          return { useSafeAreaInsets: () => ({ bottom: 34 }) };
        if (name === "@/assets/images/my") return { IconMyComments: "IconMyComments" };
        if (name === "@/components/app-bar") return { AppBar: "AppBar" };
        if (name === "@/components/TopTab") return { TopTab: "TopTab" };
        return require(name);
      },
    },
  );
  return screenModule.exports.MyPostsScreen;
}

function descendants(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)];
}

test("탭 전환으로 목록을 변경하고 각 목록에 하단 safe area를 적용한다", () => {
  const Screen = loadScreen();
  const props = { posts: [{ id: "post-1" }], votes: [{ id: "vote-1" }, { id: "vote-2" }] };
  let children = React.Children.toArray(Screen(props).props.children);
  assert.equal(children[0].props.title, "내가 쓴 글");
  assert.equal(children[1].props.activeKey, "posts");
  assert.equal(children[2].props.data, props.posts);
  assert.equal(children[2].props.contentContainerStyle.paddingBottom, 34);
  children[1].props.onChange("votes");
  children = React.Children.toArray(Screen(props).props.children);
  assert.equal(children[1].props.activeKey, "votes");
  assert.equal(children[2].props.data, props.votes);
  assert.equal(children[2].props.contentContainerStyle.paddingBottom, 34);
});

test("게시글은 1줄, 투표는 2줄로 말줄임하고 선택 콜백에 글 ID를 전달한다", () => {
  const Screen = loadScreen();
  const selected = [];
  const props = {
    posts: [{ id: "post-1", nickname: "디기", content: "게시글 본문", dateLabel: "2026.09.12" }],
    votes: [
      {
        id: "vote-1",
        nickname: "디기",
        content: "투표 본문",
        timeLabel: "5분 전",
        commentCount: 3,
        imageSource: { uri: "https://example.com/product.png" },
      },
    ],
    onPressPost: (id) => selected.push(id),
    onPressVote: (id) => selected.push(id),
  };
  function row(children, item) {
    const element = children[2].props.renderItem({ item });
    return element.type(element.props);
  }
  let children = React.Children.toArray(Screen(props).props.children);
  const post = descendants(row(children, props.posts[0]));
  const postContent = post.find((element) => element.props.children === "게시글 본문");
  assert.equal(postContent.props.numberOfLines, 1);
  post.find((element) => element.type === "Pressable").props.onPress();
  children[1].props.onChange("votes");
  children = React.Children.toArray(Screen(props).props.children);
  const vote = row(children, props.votes[0]);
  const voteContent = descendants(vote).find((element) => element.props.children === "투표 본문");
  assert.equal(voteContent.props.numberOfLines, 2);
  assert.equal(voteContent.props.ellipsizeMode, "tail");
  vote.props.onPress();
  assert.deepEqual(selected, ["post-1", "vote-1"]);
  assert.equal(descendants(vote).filter((element) => element.type === "Pressable").length, 1);
  assert.ok(descendants(vote).some((element) => element.props.accessibilityLabel === "댓글 3개"));
  assert.equal(
    descendants(vote).find((element) => element.type === "Image").props.source,
    props.votes[0].imageSource,
  );
});

test("빈 목록도 탭 전환이 가능하고 상세 연결 전에는 행을 비활성화한다", () => {
  const Screen = loadScreen();
  let children = React.Children.toArray(Screen({ posts: [], votes: [] }).props.children);
  assert.equal(children[2].props.data.length, 0);
  children[1].props.onChange("votes");
  children = React.Children.toArray(Screen({ posts: [], votes: [] }).props.children);
  assert.equal(children[2].props.data.length, 0);
  const element = children[2].props.renderItem({ item: { id: "vote-1" } });
  assert.equal(element.type(element.props).props.disabled, true);
});
