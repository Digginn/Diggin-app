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
    ts.transpileModule(readFileSync(path.join(__dirname, "..", file), "utf8"), {
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

function api(response, error = null) {
  const calls = [];
  const loaded = load("src/screens/diggle/api/community.ts", {
    "@/lib/supabase": {
      supabase: {
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data: response, error };
        },
      },
    },
  });
  return { ...loaded, calls };
}

const PREVIEW = {
  id: "12",
  type: "post",
  created_at: "2026-10-18T01:02:03.123456+00:00",
  content: "첫 줄 본문",
  items: [{ position: 1, image_url: null }],
};
const MEMBER = {
  ...PREVIEW,
  is_mine: false,
  like_count: 0,
  is_liked: false,
  comment_count: 1,
  items: [
    {
      position: 1,
      image_url: null,
      name: "게시 시점 상품",
      brand: null,
      price: 0,
      url: "https://shop.test/snapshot",
    },
  ],
};

test("비회원 응답은 익명 UUID나 가짜 집계를 만들지 않고 미리보기로 매핑한다", async () => {
  const client = api([PREVIEW]);
  const [post] = await client.fetchCommunityFeed("all", null);
  assert.equal(post.isPreview, true);
  assert.equal(post.likeCount, null);
  assert.equal(post.items[0].url, null);
  assert.equal(post.items[0].name, null);
  assert.equal("authorId" in post, false);
  assert.equal(client.calls[0].name, "get_community_feed");
});

test("커서는 마이크로초 원본 시각과 id를 그대로 전달하고 사용자 id를 받지 않는다", async () => {
  const client = api([MEMBER]);
  const [post] = await client.fetchCommunityFeed("all", null);
  await client.fetchCommunityFeed("vote", post);
  const args = client.calls[1].args;
  assert.equal(args.after_created_at, PREVIEW.created_at);
  assert.equal(args.after_id, 12);
  assert.deepEqual(Object.keys(args).sort(), ["after_created_at", "after_id", "feed_type"]);
});

test("Snapshot의 null과 0원을 구분하고 없는 상세에 목업을 채우지 않는다", async () => {
  assert.equal((await api(MEMBER).fetchCommunityPost("12")).items[0].price, 0);
  assert.equal(
    (
      await api({ ...MEMBER, items: [{ ...MEMBER.items[0], price: null }] }).fetchCommunityPost(
        "12",
      )
    ).items[0].price,
    null,
  );
  assert.equal(await api(null).fetchCommunityPost("12"), null);
});

test("권한·네트워크 오류는 빈 성공 응답으로 바꾸지 않는다", async () => {
  const error = { code: "42501", message: "not_authenticated" };
  await assert.rejects(api(null, error).fetchCommunityPost("12"), (actual) => actual === error);
  await assert.rejects(
    api({ unexpected: true }).fetchCommunityFeed("all", null),
    /invalid_community_response/,
  );
  await assert.rejects(api(null).fetchCommunityPost("preview-1"), /invalid_post_id/);
});

test("댓글은 본인·글쓴이·탈퇴·익명번호만 매핑하고 원본 사용자 UUID를 보존하지 않는다", async () => {
  const client = api([
    {
      id: "2",
      created_at: PREVIEW.created_at,
      content: null,
      author_id: "must-not-retain",
      is_post_author: false,
      is_mine: false,
      is_withdrawn: true,
      anon_number: null,
    },
  ]);
  const [comment] = await client.fetchCommunityComments("12", null);
  assert.equal(comment.isWithdrawn, true);
  assert.equal(comment.body, null);
  assert.equal("authorId" in comment, false);
  assert.equal(client.calls[0].args.target_post_id, 12);
});

test("계정·비회원·탭별 조회 캐시는 분리한다", () => {
  const { communityKeys } = api([]);
  assert.notDeepEqual(communityKeys.feed("a", "all"), communityKeys.feed(null, "all"));
  assert.notDeepEqual(communityKeys.feed("a", "all"), communityKeys.feed("b", "all"));
  assert.notDeepEqual(communityKeys.feed("a", "all"), communityKeys.feed("a", "vote"));
});

test("조회 훅은 인증 복원을 기다리고 20개 미만이면 커서 요청을 종료한다", () => {
  let options;
  let auth = { session: null, isRestoring: true };
  const hooks = load("src/screens/diggle/queries/useCommunity.ts", {
    "@tanstack/react-query": {
      useInfiniteQuery: (value) => {
        options = value;
      },
      useQuery: (value) => {
        options = value;
      },
    },
    "@/contexts/AuthContext": { useAuth: () => auth },
    "../api/community": api([]),
  });
  hooks.useCommunityFeed("all");
  assert.equal(options.enabled, false);
  auth = { session: null, isRestoring: false };
  hooks.useCommunityFeed("all");
  assert.equal(options.enabled, true);
  assert.equal(options.getNextPageParam([]), undefined);
  const page = Array.from({ length: 20 }, (_, index) => ({
    id: String(index + 1),
    createdAt: PREVIEW.created_at,
  }));
  assert.equal(options.getNextPageParam(page).id, "20");
  hooks.useCommunityPost("12");
  assert.equal(options.enabled, false);
  auth = { session: { user: { id: "viewer" } }, isRestoring: false };
  hooks.useCommunityPost("12");
  assert.equal(options.enabled, true);
});

test("SYS-009 시간 경계와 네트워크/일반 실패 문구를 구분한다", () => {
  const { formatCommunityTime, communityErrorMessage } = load(
    "src/screens/diggle/utils/formatCommunityTime.ts",
  );
  const now = Date.parse("2026-10-18T12:00:00Z");
  const at = (seconds) => new Date(now - seconds * 1000).toISOString();
  for (const [seconds, expected] of [
    [59, "방금 전"],
    [60, "1분 전"],
    [3600, "1시간 전"],
    [86400, "어제"],
    [172800, "2일 전"],
  ])
    assert.equal(formatCommunityTime(at(seconds), now), expected);
  assert.match(communityErrorMessage(new Error("Network request failed")), /연결 상태/);
  assert.match(communityErrorMessage({ message: "HTTP 500" }), /게시글/);
});

function nodes(node, type) {
  if (!React.isValidElement(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap((child) => nodes(child, type)),
  ];
}

function screenMocks({ session = {}, post = null, feed = {}, comments = [] } = {}) {
  let destination;
  const mocks = {
    "react": { ...React, useEffect: () => {}, useState: (initial) => [initial, () => {}] },
    "react-native": {
      View: "View",
      Text: "Text",
      FlatList: "FlatList",
      ScrollView: "ScrollView",
      Linking: {
        openURL: async (url) => {
          destination = url;
        },
      },
    },
    "expo-router": {
      useLocalSearchParams: () => ({ id: "12" }),
      useRouter: () => ({
        canGoBack: () => true,
        back: () => {},
        push: (value) => {
          destination = value;
        },
        replace: () => {},
        setParams: () => {},
      }),
    },
    "@/assets/images/appbar": { IconNotification: "IconNotification" },
    "@/components/app-bar": { AppBar: Object.assign(() => null, { IconButton: "IconButton" }) },
    "@/components/Button": { Button: "Button" },
    "@/components/EmptyState": { EmptyState: "EmptyState" },
    "@/components/Fab": { Fab: "Fab" },
    "@/components/Loading": { Spinner: "Spinner" },
    "@/components/modal": { LoginRequiredModal: "LoginRequiredModal" },
    "@/components/Post": { Post: "Post" },
    "@/components/TopTab": { TopTab: "TopTab" },
    "@/components/Comment": { Comment: "Comment" },
    "@/constants/messages": { DIGGLE_EMPTY_MESSAGES: { all: "empty", vote: "empty" } },
    "@/contexts/AuthContext": { useAuth: () => ({ session, isRestoring: false }) },
    "@/hooks/useToast": { useToast: () => () => {} },
    "./queries/useCommunity": {
      useCommunityFeed: () => feed,
      useCommunityPost: () => ({ data: post }),
      useCommunityComments: () => ({ data: { pages: [comments] } }),
    },
    "./utils/formatCommunityTime": {
      formatCommunityTime: () => "방금 전",
      communityErrorMessage: () => "error",
    },
    "./components/LikeCommentRow": { LikeCommentRow: "LikeCommentRow" },
    "./components/PostItemInfoSheet": { PostItemInfoSheet: "PostItemInfoSheet" },
    "./components/ProductImgGrid": { ProductImgGrid: "ProductImgGrid" },
    "./components/VoteBlock": { VoteBlock: "VoteBlock" },
    "./utils/voteTiming": load("src/screens/diggle/utils/voteTiming.ts"),
  };
  return { mocks, destination: () => destination };
}

test("비회원 상세 직접 진입은 로그인 안내로 차단하고 없는 글에 목업을 보여주지 않는다", () => {
  let state = screenMocks({ session: null });
  let { PostDetailScreen } = load("src/screens/diggle/PostDetailScreen.tsx", state.mocks);
  assert.equal(nodes(PostDetailScreen({}), "LoginRequiredModal")[0].props.visible, true);
  state = screenMocks();
  ({ PostDetailScreen } = load("src/screens/diggle/PostDetailScreen.tsx", state.mocks));
  assert.match(nodes(PostDetailScreen({}), "EmptyState")[0].props.message, /찾을 수 없습니다/);
});

test("회원 피드는 all 탭에서도 투표글 유형으로 라우팅하고 마지막 페이지는 더 요청하지 않는다", () => {
  const state = screenMocks({
    feed: {
      data: {
        pages: [
          [{ id: "12", type: "vote", body: "vote", items: [], createdAt: PREVIEW.created_at }],
        ],
      },
      hasNextPage: false,
    },
  });
  const { DiggleScreen } = load("src/screens/diggle/DiggleScreen.tsx", state.mocks);
  const list = nodes(DiggleScreen(), "FlatList")[0];
  const card = list.props.renderItem({ item: list.props.data[0] });
  assert.equal(card.props.type, "vote");
  card.props.onPress();
  assert.equal(state.destination().pathname, "/votes/[id]");
  list.props.onEndReached();
});

test("추가 페이지 실패에도 기존 목록을 유지하고 명시적 재시도를 제공한다", () => {
  let retries = 0;
  const state = screenMocks({
    feed: {
      data: { pages: [[{ id: "12" }]] },
      hasNextPage: true,
      isFetchNextPageError: true,
      fetchNextPage: () => {
        retries++;
      },
    },
  });
  const { DiggleScreen } = load("src/screens/diggle/DiggleScreen.tsx", state.mocks);
  const list = nodes(DiggleScreen(), "FlatList")[0];
  assert.equal(list.props.data.length, 1);
  list.props.onEndReached();
  assert.equal(retries, 0);
  list.props.ListFooterComponent.props.onPress();
  assert.equal(retries, 1);
});

test("상세는 실제 댓글 라벨을 표시하고 조회 화면에서 가짜 쓰기 동작을 제공하지 않는다", async () => {
  const post = await api(MEMBER).fetchCommunityPost("12");
  const state = screenMocks({
    post,
    comments: [
      { id: "1", isPostAuthor: true, body: "글쓴이 댓글", createdAt: PREVIEW.created_at },
      { id: "2", isMine: true, anonNumber: 1, body: "줄바꿈\n댓글", createdAt: PREVIEW.created_at },
      { id: "3", isWithdrawn: true, body: null, createdAt: PREVIEW.created_at },
    ],
  });
  const { PostDetailScreen } = load("src/screens/diggle/PostDetailScreen.tsx", state.mocks);
  const screen = PostDetailScreen({});
  const comments = nodes(screen, "Comment");
  assert.equal(comments[0].props.author, "글쓴이");
  assert.equal(comments[1].props.author, "디기 1(나)");
  assert.equal(comments[1].props.body, "줄바꿈 댓글");
  assert.equal(comments[2].props.isDeleted, true);
  assert.equal(nodes(screen, "LikeCommentRow")[0].props.onPressLike, undefined);
  assert.equal(nodes(screen, "PostItemInfoSheet")[0].props.onSaveToAll, undefined);
});

test("서버가 비공개로 내려준 투표 집계는 작성자·마감 화면에서도 0명 결과로 노출하지 않는다", () => {
  const { VoteBlock } = load("src/screens/diggle/components/VoteBlock.tsx", {
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable" },
  });
  const tree = VoteBlock({
    vote: { buyCount: 0, notCount: 0, myChoice: null, isClosed: true, remainingLabel: "" },
    isMyVote: true,
    hasResults: false,
    isReadOnly: true,
  });
  assert.equal(nodes(tree, "Pressable").length, 2);
  assert.ok(nodes(tree, "Pressable").every((button) => button.props.disabled));
  const text = nodes(tree, "Text")
    .map((node) => React.Children.toArray(node.props.children).join(""))
    .join(" ");
  assert.ok(!text.includes("0명"));
});
