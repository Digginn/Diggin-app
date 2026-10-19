/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "..", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => mocks[name] ?? (name.endsWith(".svg") ? name : require(name)),
      ...globals,
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

function voteClock() {
  let deviceNow = Date.parse("2026-10-18T16:59:00Z");
  let state = deviceNow;
  let tick;
  let onAppState;
  let cleanup;
  const receivedAt = deviceNow;
  const post = {
    id: "12",
    type: "vote",
    createdAt: "2026-10-17T12:00:00Z",
    serverNow: "2026-10-18T11:59:00Z",
  };
  const { useCommunityVoteTiming: renderTiming } = load(
    "src/screens/diggle/hooks/useCommunityVoteTiming.ts",
    {
      "react": {
        useState: () => [state, (update) => (state = update(state))],
        useEffect: (effect) => {
          cleanup = effect();
        },
      },
      "react-native": {
        AppState: {
          addEventListener: (_, handler) => {
            onAppState = handler;
            return { remove: () => (onAppState = undefined) };
          },
        },
      },
      "../utils/voteTiming": load("src/screens/diggle/utils/voteTiming.ts"),
    },
    {
      Date: class extends Date {
        static now() {
          return deviceNow;
        }
      },
      setInterval: (handler) => {
        tick = handler;
        return 1;
      },
      clearInterval: () => (tick = undefined),
    },
  );
  return {
    render: (value = post, updatedAt = receivedAt) => renderTiming(value, updatedAt),
    advance: (milliseconds) => (deviceNow += milliseconds),
    tick: () => tick?.(),
    activate: () => onAppState?.("active"),
    unmount: () => cleanup?.(),
    remount: () => {
      cleanup?.();
      state = deviceNow;
    },
    hasListeners: () => !!tick || !!onAppState,
    post,
  };
}

test("투표 상세는 서버 시각을 기준으로 남은 시간을 줄이고 24시간 경계에서 종료한다", () => {
  const clock = voteClock();
  assert.equal(clock.render().remainingLabel, "1분 남음");
  clock.advance(60_000);
  clock.tick();
  assert.equal(clock.render().isClosed, true);
  assert.equal(clock.render().remainingLabel, "투표가 종료되었습니다.");
  clock.unmount();
  assert.equal(clock.hasListeners(), false);
});

test("백그라운드에서 마감된 투표는 복귀 즉시 갱신한다", () => {
  const clock = voteClock();
  clock.render();
  clock.advance(120_000);
  clock.activate();
  assert.equal(clock.render().isClosed, true);
  clock.unmount();
});

test("오래된 캐시로 상세에 재진입해도 마감 상태를 유지하고 일반글은 타이머를 만들지 않는다", () => {
  const clock = voteClock();
  clock.render();
  clock.advance(120_000);
  clock.remount();
  assert.equal(clock.render().isClosed, true);
  clock.unmount();
  const ordinaryPost = voteClock();
  assert.equal(ordinaryPost.render({ ...ordinaryPost.post, type: "post" }), null);
  assert.equal(ordinaryPost.hasListeners(), false);
});

function nodes(node, type) {
  if (!React.isValidElement(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap((child) => nodes(child, type)),
    ...nodes(node.props.ListHeaderComponent, type),
    ...nodes(node.props.ListFooterComponent, type),
    ...(node.type === "FlatList"
      ? (node.props.data ?? []).flatMap((item) => nodes(node.props.renderItem({ item }), type))
      : []),
  ];
}

function screenMocks({
  session = { user: { id: "viewer" } },
  post = null,
  feed = {},
  comments = [],
  postResult = {},
  commentsResult = {},
} = {}) {
  let destination;
  const toasts = [];
  const mocks = {
    "react": {
      ...React,
      useEffect: () => {},
      useState: (initial) => [initial, () => {}],
      useRef: (initial) => ({ current: initial }),
      useMemo: (callback) => callback(),
      useCallback: (callback) => callback,
    },
    "react-native": {
      View: "View",
      Text: "Text",
      FlatList: "FlatList",
      ScrollView: "ScrollView",
      KeyboardAvoidingView: "KeyboardAvoidingView",
      Pressable: "Pressable",
      Platform: { OS: "android" },
      useWindowDimensions: () => ({ height: 812, width: 375 }),
      Keyboard: { isVisible: () => false, addListener: () => ({ remove() {} }), dismiss() {} },
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
        replace: (value) => {
          destination = value;
        },
        setParams: () => {},
      }),
    },
    "expo-router/react-navigation": { usePreventRemove() {} },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "@/components/CommentInput": { CommentInput: "CommentInput" },
    "@/components/CommentEditBanner": { CommentEditBanner: "CommentEditBanner" },
    "@/components/FloatingToolbar": { FloatingToolbar: "FloatingToolbar" },
    "./domain/comments": load("src/screens/diggle/domain/comments.ts"),
    "./hooks/useCommentActions": {
      useCommentActions: () => ({
        changes: {},
        body: "",
        editing: null,
        deleteTarget: null,
        isSending: false,
        isDeleting: false,
      }),
    },
    "./hooks/useCommunityLike": {
      useCommunityLike: (post) => ({
        likeCount: post?.likeCount ?? 0,
        isLiked: post?.isLiked ?? false,
        isPending: false,
        toggle() {},
      }),
    },
    "@/assets/images/appbar": { IconNotification: "IconNotification" },
    "@/components/app-bar": {
      AppBar: Object.assign(() => null, { IconButton: "IconButton", TextButton: "TextButton" }),
    },
    "@/components/Button": { Button: "Button" },
    "@/components/EmptyState": { EmptyState: "EmptyState" },
    "@/components/Fab": { Fab: "Fab" },
    "@/components/Loading": { Spinner: "Spinner" },
    "@/components/modal": { LoginRequiredModal: "LoginRequiredModal", ActionModal: "ActionModal" },
    "@/components/ToastText": { ToastText: "ToastText" },
    "@tanstack/react-query": { useQueryClient: () => ({ invalidateQueries: () => {} }) },
    "./api/community": { communityKeys: { all: ["community"] } },
    "./api/communityWrite": {
      deleteCommunityPost: async () => {},
      communityWriteError: () => "error",
    },
    "@/components/Post": { Post: "Post" },
    "@/components/TopTab": { TopTab: "TopTab" },
    "@/components/Comment": { Comment: "Comment" },
    "@/constants/messages": { DIGGLE_EMPTY_MESSAGES: { all: "empty", vote: "empty" } },
    "@/contexts/AuthContext": { useAuth: () => ({ session, isRestoring: false }) },
    "@/hooks/useToast": { useToast: () => (message) => toasts.push(message) },
    "@/utils/text": load("src/utils/text.ts"),
    "./queries/useCommunity": {
      useCommunityFeed: () => feed,
      useCommunityPost: () => ({ data: post, ...postResult }),
      useCommunityComments: () => ({ data: { pages: [comments] }, ...commentsResult }),
    },
    "./utils/formatCommunityTime": {
      formatCommunityTime: () => "방금 전",
      communityErrorMessage: load("src/screens/diggle/utils/formatCommunityTime.ts")
        .communityErrorMessage,
    },
    "./components/LikeCommentRow": { LikeCommentRow: "LikeCommentRow" },
    "./components/PostItemInfoSheet": { PostItemInfoSheet: "PostItemInfoSheet" },
    "./components/ProductImgGrid": { ProductImgGrid: "ProductImgGrid" },
    "./components/VoteBlock": { VoteBlock: "VoteBlock" },
    "./utils/voteTiming": load("src/screens/diggle/utils/voteTiming.ts"),
    "./hooks/useCommunityVoteTiming": {
      useCommunityVoteTiming: (post) =>
        post?.type === "vote"
          ? load("src/screens/diggle/utils/voteTiming.ts").getVoteTiming(
              Date.parse(post.createdAt),
              Date.parse(post.serverNow),
            )
          : null,
    },
  };
  return { mocks, toasts, destination: () => destination };
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
  assert.equal(typeof nodes(screen, "LikeCommentRow")[0].props.onPressLike, "function");
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

test("상세 URL의 종류가 다르면 실제 글 주소로 교체하며 없는 글 안내를 띄우지 않는다", async () => {
  for (const actualType of ["post", "vote"]) {
    const post = await api({ ...MEMBER, type: actualType }).fetchCommunityPost("12");
    const state = screenMocks({ post });
    state.mocks.react.useEffect = (effect) => effect();
    const { PostDetailScreen } = load("src/screens/diggle/PostDetailScreen.tsx", state.mocks);
    const tree = PostDetailScreen({ type: actualType === "post" ? "vote" : "all" });
    assert.equal(
      state.destination().pathname,
      actualType === "vote" ? "/votes/[id]" : "/posts/[id]",
    );
    assert.equal(state.destination().params.id, "12");
    assert.equal(nodes(tree, "EmptyState").length, 0);
    assert.equal(nodes(tree, "Spinner").length, 1);
  }
});

test("댓글은 스크롤 끝에서 추가 조회하고 진행 중·마지막 페이지·실패 상태에서는 반복 요청하지 않는다", async () => {
  const post = await api(MEMBER).fetchCommunityPost("12");
  let requests = 0;
  const commentsResult = {
    hasNextPage: true,
    isFetching: false,
    isFetchNextPageError: false,
    fetchNextPage: (options) => {
      assert.equal(options.cancelRefetch, false);
      requests++;
    },
  };
  const state = screenMocks({ post, commentsResult });
  const { PostDetailScreen } = load("src/screens/diggle/PostDetailScreen.tsx", state.mocks);
  const list = () => nodes(PostDetailScreen({}), "FlatList")[0];
  list().props.onEndReached();
  assert.equal(requests, 1);
  commentsResult.isFetching = true;
  list().props.onEndReached();
  commentsResult.isFetching = false;
  commentsResult.hasNextPage = false;
  list().props.onEndReached();
  commentsResult.hasNextPage = true;
  commentsResult.isFetchNextPageError = true;
  list().props.onEndReached();
  assert.equal(requests, 1);
  assert.equal(
    nodes(PostDetailScreen({}), "Button").some(
      (button) => button.props.children === "댓글 더 보기",
    ),
    false,
  );
});

test("댓글 첫 조회와 추가 조회 실패는 본문·기존 댓글을 유지하고 댓글 전용 안내 및 올바른 재시도를 제공한다", async () => {
  const post = await api(MEMBER).fetchCommunityPost("12");
  for (const nextPage of [false, true]) {
    let refetched = 0,
      fetchedNext = 0;
    const state = screenMocks({
      post,
      comments: nextPage ? [{ id: "1", body: "기존 댓글", createdAt: PREVIEW.created_at }] : [],
      commentsResult: {
        isError: true,
        error: { message: "server error" },
        isFetchNextPageError: nextPage,
        refetch: () => refetched++,
        fetchNextPage: () => fetchedNext++,
      },
    });
    state.mocks.react.useEffect = (effect) => effect();
    const { PostDetailScreen } = load("src/screens/diggle/PostDetailScreen.tsx", state.mocks);
    const tree = PostDetailScreen({});
    assert.equal(
      nodes(tree, "Text").some((text) => text.props.children === post.body),
      true,
    );
    assert.equal(nodes(tree, "Comment").length, nextPage ? 1 : 0);
    assert.equal(
      nodes(tree, "Text").some(
        (text) => text.props.children === "댓글을 불러오지 못했습니다. 다시 시도해 주세요.",
      ),
      true,
    );
    assert.deepEqual(state.toasts, []);
    nodes(tree, "Button")
      .find((button) => button.props.accessibilityLabel === "댓글 다시 불러오기")
      .props.onPress();
    assert.equal(refetched, nextPage ? 0 : 1);
    assert.equal(fetchedNext, nextPage ? 1 : 0);
  }
});

test("피드·상세 첫 조회 실패는 화면 안내만 표시하고 기존 게시글이 있는 재조회 실패만 토스트로 알린다", async () => {
  const error = { message: "server error" };
  const post = await api(MEMBER).fetchCommunityPost("12");
  for (const hasData of [false, true]) {
    const detail = screenMocks({
      post: hasData ? post : null,
      postResult: { isError: true, error },
    });
    detail.mocks.react.useEffect = (effect) => effect();
    const { PostDetailScreen } = load("src/screens/diggle/PostDetailScreen.tsx", detail.mocks);
    const tree = PostDetailScreen({});
    assert.equal(detail.toasts.length, hasData ? 1 : 0);
    assert.equal(nodes(tree, "EmptyState").length, hasData ? 0 : 1);
    const feed = screenMocks({
      feed: { data: { pages: [hasData ? [post] : []] }, isError: true, error },
    });
    feed.mocks.react.useEffect = (effect) => effect();
    const { DiggleScreen } = load("src/screens/diggle/DiggleScreen.tsx", feed.mocks);
    const list = nodes(DiggleScreen(), "FlatList")[0];
    assert.equal(feed.toasts.length, hasData ? 1 : 0);
    assert.equal(
      nodes(list.props.ListEmptyComponent, "Text")[0].props.children,
      "게시글을 불러오지 못했습니다. 다시 시도해 주세요.",
    );
  }
});

test("투표 블록은 본문 컨테이너의 좌우 여백을 그대로 사용한다", () => {
  const { VoteBlock } = load("src/screens/diggle/components/VoteBlock.tsx", {
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable" },
  });
  const tree = VoteBlock({
    vote: { buyCount: 0, notCount: 0, myChoice: null, isClosed: false, remainingLabel: "1시간" },
  });
  assert.equal(tree.props.className.includes("px-margin"), false);
});
