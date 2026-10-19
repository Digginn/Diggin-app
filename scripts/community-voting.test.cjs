/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(file, mocks = {}) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "..", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    { module, exports: module.exports, require: (name) => mocks[name] ?? require(name) },
  );
  return module.exports;
}
const keys = load("src/screens/diggle/api/community.ts", { "@/lib/supabase": { supabase: {} } });
const initial = () => ({
  id: "12",
  type: "vote",
  isMine: false,
  myChoice: null,
  buyCount: null,
  notCount: null,
  commentCount: 4,
});
const saved = (choice = "buy") => ({
  ...initial(),
  myChoice: choice,
  buyCount: choice === "buy" ? 1 : 0,
  notCount: choice === "not" ? 1 : 0,
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function harness(send = async (_id, choice) => saved(choice)) {
  const slots = [],
    effects = new Map(),
    calls = [],
    toasts = [],
    invalidations = [];
  let index = 0,
    pending = [],
    post = initial(),
    onActive;
  const client = {
    invalidateQueries: (input) => {
      invalidations.push(input);
      return Promise.resolve();
    },
    setQueryData: (_key, update) => {
      post = update(post);
    },
  };
  const { useCommunityVote } = load("src/screens/diggle/hooks/useCommunityVote.ts", {
    "react": {
      useState: (initial) => {
        const slot = index++;
        if (!(slot in slots)) slots[slot] = initial;
        return [
          slots[slot],
          (next) => {
            slots[slot] = next;
          },
        ];
      },
      useRef: (initial) => {
        const slot = index++;
        return (slots[slot] ??= { current: initial });
      },
      useEffect: (callback, deps) => {
        const slot = index++;
        if (
          !effects.has(slot) ||
          deps.some((value, i) => !Object.is(value, effects.get(slot).deps[i]))
        )
          pending.push({ slot, callback, deps });
      },
    },
    "react-native": {
      AppState: {
        addEventListener: (_event, callback) => {
          onActive = callback;
          return {
            remove() {
              onActive = undefined;
            },
          };
        },
      },
    },
    "@tanstack/react-query": { useQueryClient: () => client },
    "@/hooks/useToast": { useToast: () => (message) => toasts.push(message) },
    "../api/community": keys,
    "../api/communityVote": {
      setCommunityVote: (...args) => {
        calls.push(args);
        return send(...args);
      },
    },
    "../api/communityWrite": { communityWriteError: () => "요청 실패" },
  });
  return {
    render(viewer = "viewer", isClosed = false) {
      index = 0;
      pending = [];
      const result = useCommunityVote(post, viewer, isClosed);
      for (const { slot, callback, deps } of pending) {
        effects.get(slot)?.cleanup?.();
        effects.set(slot, { deps, cleanup: callback() });
      }
      return result;
    },
    setPost(value) {
      post = { ...post, ...value };
    },
    post: () => post,
    calls,
    toasts,
    invalidations,
    active: () => onActive?.("active"),
    unmount() {
      for (const effect of effects.values()) effect.cleanup?.();
    },
  };
}

test("투표 API는 글·선택만 보내고 서버 결과를 검증한다", async () => {
  let response = {
    id: "12",
    type: "vote",
    created_at: "2026-10-20T00:00:00Z",
    content: "질문입니다",
    items: [],
    my_choice: "buy",
    buy_count: 1,
    not_count: 0,
  };
  let failure = null;
  const calls = [];
  const { setCommunityVote } = load("src/screens/diggle/api/communityVote.ts", {
    "./community": keys,
    "@/lib/supabase": {
      supabase: {
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data: response, error: failure };
        },
      },
    },
  });
  assert.equal((await setCommunityVote("12", "buy")).buyCount, 1);
  assert.equal(calls[0].name, "set_community_vote");
  assert.deepEqual(Object.keys(calls[0].args).sort(), ["target_post_id", "vote_option"]);
  response = { ...response, buy_count: null };
  await assert.rejects(setCommunityVote("12", "buy"), /invalid_community_response/);
  failure = { message: "vote_closed" };
  await assert.rejects(setCommunityVote("12", "buy"), (error) => error === failure);
});

test("최초 투표 실패는 미참여 상태를 유지하고 재시도 성공 시 결과를 표시한다", async () => {
  let fails = true;
  const ui = harness(async () => {
    if (fails) throw Error("network");
    return saved();
  });
  await ui.render().choose("BUY");
  assert.equal(ui.post().myChoice, null);
  assert.equal(ui.post().buyCount, null);
  assert.equal(ui.toasts.length, 1);
  fails = false;
  await ui.render().choose("BUY");
  assert.equal(ui.post().myChoice, "buy");
  assert.equal(ui.post().buyCount, 1);
  assert.equal(ui.render().isPending, false);
  assert.equal(ui.invalidations.length, 1);
});

test("연타는 한 요청이며 선택 변경 실패는 기존 선택·집계를 유지한다", async () => {
  const work = deferred();
  const ui = harness(() => work.promise);
  ui.setPost(saved());
  const action = ui.render();
  await action.choose("BUY");
  assert.equal(ui.calls.length, 0, "현재 선택은 요청하지 않는다");
  const sending = action.choose("NOT");
  await action.choose("NOT");
  assert.equal(ui.render().isPending, true);
  assert.equal(ui.calls.length, 1);
  work.reject(Error("failed"));
  await sending;
  assert.equal(ui.post().myChoice, "buy");
  assert.equal(ui.post().buyCount, 1);
  assert.equal(ui.post().notCount, 0);
});

test("성공한 선택 변경은 최신 집계를 적용하고 동시에 갱신된 댓글 수를 보존한다", async () => {
  const work = deferred();
  const ui = harness(() => work.promise);
  ui.setPost(saved());
  const sending = ui.render().choose("NOT");
  ui.setPost({ commentCount: 8 });
  work.resolve(saved("not"));
  await sending;
  assert.equal(ui.post().notCount, 1);
  assert.equal(ui.post().buyCount, 0);
  assert.equal(ui.post().commentCount, 8);
});

test("작성자는 안내만 보이며 비회원·일반글·마감 후에는 투표하지 않는다", async () => {
  const ui = harness();
  ui.setPost({ isMine: true });
  await ui.render().choose("BUY");
  assert.match(ui.toasts[0], /본인/);
  assert.equal(ui.calls.length, 0);
  ui.setPost({ isMine: false });
  await ui.render(null).choose("BUY");
  await ui.render("viewer", true).choose("BUY");
  ui.setPost({ type: "post" });
  await ui.render().choose("BUY");
  assert.equal(ui.calls.length, 0);
});

test("화면 마감·앱 복귀는 결과를 다시 조회하며 반복 렌더로 조회하지 않는다", () => {
  const ui = harness();
  ui.render();
  ui.render();
  assert.equal(ui.invalidations.length, 0);
  ui.render("viewer", true);
  ui.render("viewer", true);
  assert.equal(ui.invalidations.length, 1);
  ui.active();
  assert.equal(ui.invalidations.length, 2);
});

test("서버 마감 거절은 기존 결과를 보존하고 안내 후 최종 결과를 갱신한다", async () => {
  const ui = harness(async () => {
    throw { message: "vote_closed" };
  });
  ui.setPost(saved());
  await ui.render().choose("NOT");
  assert.equal(ui.post().myChoice, "buy");
  assert.equal(ui.post().buyCount, 1);
  assert.match(ui.toasts[0], /종료/);
  assert.equal(ui.invalidations.length, 1);
});

test("이전 계정·화면에서 늦게 도착한 투표 응답은 새 캐시에 적용하지 않는다", async () => {
  for (const unmount of [false, true]) {
    const work = deferred();
    const ui = harness(() => work.promise);
    const sending = ui.render().choose("BUY");
    if (unmount) ui.unmount();
    else {
      ui.render("other");
      ui.render("other");
    }
    work.resolve(saved());
    await sending;
    assert.equal(ui.post().myChoice, null);
    assert.equal(ui.invalidations.length, 0);
    if (!unmount) assert.equal(ui.render("viewer").isPending, false);
  }
});
