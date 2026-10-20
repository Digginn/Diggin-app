/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function loadScreen(screenName = "MyPostsScreen", options = {}) {
  let activeKey = "posts";
  function load(relativePath) {
    const screenModule = { exports: {} };
    const source = readFileSync(path.join(__dirname, relativePath), "utf8");
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
              useEffect: (callback) => callback(),
              useCallback: (callback) => callback,
              useState: () => [activeKey, (key) => (activeKey = key)],
            };
          if (name === "expo-router")
            return {
              useRouter: () => ({
                push: (value) => {
                  if (options.navigationFails) throw Error("navigation");
                  options.selected?.push(value);
                },
                canGoBack: () => false,
                replace: () => {},
              }),
              useFocusEffect: (callback) => callback(),
            };
          if (name === "@/contexts/AuthContext")
            return {
              useAuth: () => ({
                session: options.guest ? null : { user: { id: "viewer" } },
                isRestoring: !!options.isRestoring,
              }),
            };
          if (name === "@/hooks/useToast")
            return { useToast: () => (message) => options.toasts?.push(message) };
          if (name === "@tanstack/react-query")
            return {
              useQueryClient: () => ({
                invalidateQueries: (value) => options.invalidations?.push(value),
              }),
            };
          if (name === "@/screens/diggle/api/community")
            return {
              communityKeys: {
                activity: (viewer, kind) => ["community", viewer, "activity", kind],
              },
            };
          if (name === "@/screens/diggle/utils/formatCommunityTime")
            return {
              formatCommunityTime: () => "방금 전",
              communityErrorMessage: () => "조회 실패",
            };
          if (name === "./queries/useCommunityActivity")
            return {
              useCommunityActivity: (kind) => ({
                data: { pages: [options.rows?.[kind] ?? []] },
                isPending: false,
                ...options.result,
              }),
            };
          if (name === "@/components/Button") return { Button: "Button" };
          if (name === "@/components/EmptyState") return { EmptyState: "EmptyState" };
          if (name === "@/components/Loading") return { Spinner: "Spinner" };
          if (name === "@/components/modal") return { LoginRequiredModal: "LoginRequiredModal" };
          if (name === "@/components/Post") return { Post: "Post" };
          if (name === "react-native")
            return { FlatList: "FlatList", Pressable: "Pressable", Text: "Text", View: "View" };
          if (name === "expo-image") return { Image: "Image" };
          if (name === "nativewind") return { cssInterop: (component) => component };
          if (name === "react-native-safe-area-context")
            return { useSafeAreaInsets: () => ({ bottom: 34 }) };
          if (name === "@/assets/images/my")
            return {
              IconMyComments: "IconMyComments",
              IconMyReport: "IconMyReport",
              ImageMyVotePlaceholder: "placeholder",
            };
          if (name === "@/components/app-bar") return { AppBar: "AppBar" };
          if (name === "@/components/TopTab") return { TopTab: "TopTab" };
          if (name === "./components/VoteListItem")
            return load("../src/screens/my/components/VoteListItem.tsx");
          return require(name);
        },
      },
    );
    return screenModule.exports;
  }
  return load(`../src/screens/my/${screenName}.tsx`)[screenName];
}

function descendants(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)];
}

const activity = (id, type = "post") => ({
  post: {
    id,
    type,
    body: "테스트 본문",
    isMine: true,
    createdAt: "2026-10-20T00:00:00Z",
    commentCount: 3,
    items: [{ imageUrl: "https://example.com/item.png" }],
  },
  cursor: { id, createdAt: "2026-10-20T00:00:00Z" },
});
const find = (tree, type) => descendants(tree).find((node) => node.type === type);

test("탭마다 실제 본인 목록을 표시하고 safe area와 신고 미노출을 유지한다", () => {
  const rows = { post: [activity("1")], vote: [activity("2", "vote")] };
  const invalidations = [],
    selected = [];
  const Screen = loadScreen("MyPostsScreen", { rows, invalidations, selected });
  let tree = Screen();
  let list = find(tree, "FlatList");
  assert.equal(find(tree, "AppBar").props.title, "내가 쓴 글");
  assert.equal(list.props.data[0].post.id, "1");
  assert.equal(list.props.contentContainerStyle.paddingBottom, 34);
  let row = list.props.renderItem({ item: rows.post[0] });
  let rendered = row.type(row.props);
  assert.equal(
    descendants(rendered).find((node) => node.props.children === "테스트 본문").props.numberOfLines,
    1,
  );
  find(rendered, "Pressable").props.onPress();
  find(tree, "TopTab").props.onChange("votes");
  tree = Screen();
  list = find(tree, "FlatList");
  assert.equal(list.props.data[0].post.id, "2");
  row = list.props.renderItem({ item: rows.vote[0] });
  rendered = row.type(row.props);
  assert.equal(row.props.onReport, undefined);
  assert.equal(
    descendants(rendered).find((node) => node.props.children === "테스트 본문").props.numberOfLines,
    2,
  );
  rendered.props.onPress();
  assert.deepEqual(
    selected.map((value) => value.pathname),
    ["/posts/[id]", "/votes/[id]"],
  );
  assert.equal(invalidations[0].queryKey[0], "community");
});

test("좋아요한 글은 탭 없이 실제 카드를 표시하고 상세로 이동한다", () => {
  const selected = [];
  const item = activity("4");
  const Screen = loadScreen("MyPostsScreen", { rows: { liked: [item] }, selected });
  const tree = Screen({ isLiked: true });
  assert.equal(find(tree, "AppBar").props.title, "내가 좋아요한 글");
  assert.equal(find(tree, "TopTab"), undefined);
  const row = find(tree, "FlatList").props.renderItem({ item });
  assert.equal(row.type, "Post");
  assert.equal(row.props.onPressReport, undefined);
  row.props.onPress();
  assert.equal(selected[0].params.id, "4");
});

test("빈 상태·최초 오류·추가 페이지 오류를 구분하고 기존 목록을 유지한다", () => {
  let retries = 0,
    next = 0;
  let Screen = loadScreen();
  let list = find(Screen(), "FlatList");
  assert.ok(find(list.props.ListEmptyComponent, "EmptyState"));
  Screen = loadScreen("MyPostsScreen", {
    result: { isError: true, error: Error("offline"), refetch: () => retries++ },
  });
  list = find(Screen(), "FlatList");
  find(list.props.ListEmptyComponent, "Button").props.onPress();
  assert.equal(retries, 1);
  Screen = loadScreen("MyPostsScreen", {
    rows: { post: [activity("1")] },
    result: { hasNextPage: true, isFetchNextPageError: true, fetchNextPage: () => next++ },
  });
  list = find(Screen(), "FlatList");
  list.props.onEndReached();
  assert.equal(next, 0);
  list.props.ListFooterComponent.props.onPress();
  assert.equal(next, 1);
  assert.equal(list.props.data.length, 1);
});

test("목록의 새로고침·추가 조회와 중복 조회 차단을 연결한다", () => {
  let next = 0,
    refresh = 0;
  for (const isFetching of [false, true]) {
    const Screen = loadScreen("MyPostsScreen", {
      result: {
        hasNextPage: true,
        isFetching,
        fetchNextPage: () => next++,
        refetch: () => refresh++,
      },
    });
    const list = find(Screen(), "FlatList");
    list.props.onEndReached();
    list.props.onRefresh();
  }
  assert.equal(next, 1);
  assert.equal(refresh, 2);
});

test("비회원은 목록 대신 로그인 안내를 받으며 인증 복원 중에는 목록을 노출하지 않는다", () => {
  let Screen = loadScreen("MyPostsScreen", { guest: true });
  let tree = Screen();
  assert.ok(find(tree, "LoginRequiredModal"));
  assert.equal(find(tree, "FlatList"), undefined);
  Screen = loadScreen("MyPostsScreen", { isRestoring: true });
  tree = Screen();
  assert.ok(find(tree, "Spinner"));
  assert.equal(find(tree, "FlatList"), undefined);
});

test("재조회·화면 이동 실패에도 기존 목록을 유지하고 오류를 안내한다", () => {
  const toasts = [];
  const item = activity("1");
  const Screen = loadScreen("MyPostsScreen", {
    rows: { post: [item] },
    toasts,
    navigationFails: true,
    result: { error: Error("offline") },
  });
  const list = find(Screen(), "FlatList");
  const row = list.props.renderItem({ item });
  row.props.onPress();
  assert.equal(list.props.data.length, 1);
  assert.equal(toasts.length, 2);
});

test("내가 투표한 글은 탭 없이 참여 목록을 렌더링하고 신고·상세 동작을 분리한다", () => {
  const Screen = loadScreen("MyVotedPostsScreen");
  const selected = [];
  const reports = [];
  const item = { id: "participated-vote-1", nickname: "디기", commentCount: 1 };
  const votes = [item];
  const children = React.Children.toArray(
    Screen({
      votes,
      onPressVote: (id) => selected.push(id),
      onReportVote: (id) => reports.push(id),
    }).props.children,
  );
  assert.equal(children.length, 2);
  assert.equal(children[0].props.title, "내가 투표한 글");
  assert.equal(children[1].props.data, votes);
  assert.equal(children[1].props.contentContainerStyle.paddingBottom, 34);
  const element = children[1].props.renderItem({ item });
  const row = element.type(element.props);
  const report = descendants(row).find(
    (node) => node.props.accessibilityLabel === "디기님의 투표글 신고",
  );
  let hasStoppedPropagation = false;
  report.props.onPress({ stopPropagation: () => (hasStoppedPropagation = true) });
  assert.equal(hasStoppedPropagation, true);
  assert.deepEqual(reports, [item.id]);
  assert.deepEqual(selected, []);
  assert.ok(report.props.className.includes("h-12 w-12"));
  row.props.onPress();
  assert.deepEqual(selected, [item.id]);
});

test("상세 화면 연결 전에도 참여 목록의 신고 버튼은 활성화된다", () => {
  const Screen = loadScreen("MyVotedPostsScreen");
  const children = React.Children.toArray(
    Screen({ votes: [], onReportVote: () => {} }).props.children,
  );
  const element = children[1].props.renderItem({ item: { id: "vote-1" } });
  assert.equal(element.type(element.props).props.disabled, false);
});
