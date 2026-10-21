/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(file, mocks) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "..", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    { module, exports: module.exports, require: (name) => mocks[name] ?? require(name) },
  );
  return module.exports;
}
const community = load("src/screens/diggle/api/community.ts", {
  "@/lib/supabase": { supabase: {} },
});
const row = () => ({
  activity_at: "2026-10-20T01:02:03.123456+00:00",
  activity_id: "91",
  post: {
    id: "12",
    type: "post",
    created_at: "2026-09-01T00:00:00Z",
    content: "내 활동 게시글",
    items: [],
    is_mine: true,
    is_liked: true,
    comment_count: 0,
    like_count: 1,
  },
});
function api(response, error = null) {
  const calls = [];
  const value = load("src/screens/my/api/communityActivity.ts", {
    "@/screens/diggle/api/community": community,
    "@/lib/supabase": {
      supabase: {
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data: response, error };
        },
      },
    },
  });
  return { ...value, calls };
}

test("좋아요 목록은 글 작성 시각 대신 좋아요 원본 시각·ID를 다음 커서로 보존한다", async () => {
  const client = api([row()]);
  const [item] = await client.fetchCommunityActivity("liked", null);
  assert.equal(item.post.id, "12");
  assert.equal(item.cursor.id, "91");
  assert.notEqual(item.post.createdAt, item.cursor.createdAt);
  await client.fetchCommunityActivity("liked", item.cursor);
  const { name, args } = client.calls[1];
  assert.equal(name, "get_my_community_activity");
  assert.equal(args.after_activity_at, row().activity_at);
  assert.equal(args.after_id, 91);
  assert.deepEqual(Object.keys(args).sort(), ["activity_type", "after_activity_at", "after_id"]);
});

test("활동 응답에서 작성자 UUID를 보존하지 않고 타인 글·취소된 좋아요·유형 불일치를 거부한다", async () => {
  const data = row();
  data.post.author_id = "hidden";
  const [item] = await api([data]).fetchCommunityActivity("post", null);
  assert.equal("author_id" in item.post, false);
  data.post.is_mine = false;
  await assert.rejects(
    api([data]).fetchCommunityActivity("post", null),
    /invalid_activity_response/,
  );
  data.post.is_liked = false;
  await assert.rejects(
    api([data]).fetchCommunityActivity("liked", null),
    /invalid_activity_response/,
  );
  await assert.rejects(
    api([row()]).fetchCommunityActivity("vote", null),
    /invalid_activity_response/,
  );
});

test("오류·잘못된 응답은 빈 성공으로 바꾸지 않으며 커서도 검증한다", async () => {
  const error = { code: "42501", message: "not_authenticated" };
  await assert.rejects(
    api(null, error).fetchCommunityActivity("post", null),
    (value) => value === error,
  );
  for (const response of [
    null,
    {},
    [{ ...row(), activity_at: "invalid" }],
    [{ ...row(), activity_id: "-1" }],
  ])
    await assert.rejects(api(response).fetchCommunityActivity("post", null));
  assert.equal((await api([]).fetchCommunityActivity("post", null)).length, 0);
});

test("활동 캐시는 계정·종류별로 분리되고 쓰기 후 공통 무효화 범위에 포함된다", () => {
  const keys = [
    community.communityKeys.activity("a", "post"),
    community.communityKeys.activity("a", "vote"),
    community.communityKeys.activity("a", "liked"),
    community.communityKeys.activity("b", "liked"),
    community.communityKeys.activity(null, "liked"),
  ];
  assert.equal(new Set(keys.map(JSON.stringify)).size, 5);
  assert.ok(keys.every((key) => key[0] === community.communityKeys.all[0]));
});

test("조회 훅은 인증 복원을 기다리고 좋아요 전용 커서로만 다음 페이지를 연다", () => {
  let captured,
    session = { user: { id: "viewer" } },
    isRestoring = false;
  const { useCommunityActivity } = load("src/screens/my/queries/useCommunityActivity.ts", {
    "@tanstack/react-query": { useInfiniteQuery: (options) => (captured = options) },
    "@/contexts/AuthContext": { useAuth: () => ({ session, isRestoring }) },
    "@/screens/diggle/api/community": community,
    "../api/communityActivity": { fetchCommunityActivity: () => {} },
  });
  useCommunityActivity("liked");
  assert.equal(captured.enabled, true);
  const page = Array.from({ length: 20 }, (_, index) => ({
    post: { id: String(index) },
    cursor: { id: String(100 + index), createdAt: "2026-10-20T00:00:00Z" },
  }));
  assert.equal(captured.getNextPageParam(page), page[19].cursor);
  assert.equal(captured.getNextPageParam(page.slice(0, 19)), undefined);
  isRestoring = true;
  useCommunityActivity("post");
  assert.equal(captured.enabled, false);
  isRestoring = false;
  session = null;
  useCommunityActivity("post");
  assert.equal(captured.enabled, false);
});

test("내 활동 메뉴는 두 실제 목록으로 이동하고 이동 실패·비회원 접근을 안내한다", () => {
  const React = require("react"),
    selected = [],
    toasts = [];
  let guest = false,
    fail = false;
  const { MyActivityScreen } = load("src/screens/my/MyActivityScreen.tsx", {
    "expo-router": {
      useIsFocused: () => true,
      useRouter: () => ({
        push: (target) => {
          if (fail) throw Error("navigation");
          selected.push(target);
        },
        canGoBack: () => false,
        replace: () => {},
      }),
    },
    "react-native": { ScrollView: "ScrollView", View: "View" },
    "@/components/app-bar": { AppBar: "AppBar" },
    "@/components/modal": { LoginRequiredModal: "LoginRequiredModal" },
    "@/contexts/AuthContext": {
      useAuth: () => ({ session: guest ? null : { user: { id: "viewer" } }, isRestoring: false }),
    },
    "@/hooks/useToast": { useToast: () => (text) => toasts.push(text) },
    "./components/MyMenuList": { MyMenuList: "MyMenuList" },
  });
  function nodes(value) {
    return React.isValidElement(value)
      ? [value, ...React.Children.toArray(value.props.children).flatMap(nodes)]
      : [];
  }
  let tree = MyActivityScreen();
  const menu = nodes(tree).find((node) => node.type === "MyMenuList");
  menu.props.rows.forEach((item) => item.onPress());
  assert.deepEqual(selected, ["/my-posts", "/my-liked-posts"]);
  fail = true;
  menu.props.rows[0].onPress();
  assert.equal(toasts.length, 1);
  guest = true;
  tree = MyActivityScreen();
  assert.ok(nodes(tree).some((node) => node.type === "LoginRequiredModal"));
  assert.ok(!nodes(tree).some((node) => node.type === "MyMenuList"));
});
