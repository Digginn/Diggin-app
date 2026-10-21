/* global __dirname, URL */
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
    {
      module,
      exports: module.exports,
      URL,
      require: (name) =>
        mocks[name] ??
        (name === "@/api/accountAccess"
          ? { ensureCommunityWriteAllowed: async () => undefined, restrictionMessage: () => null }
          : require(name)),
    },
  );
  return module.exports;
}
const text = load("src/utils/text.ts");
const keys = load("src/screens/diggle/api/community.ts", { "@/lib/supabase": { supabase: {} } });
const row = (id = "90", body = "새 댓글") => ({
  id,
  body,
  createdAt: "2026-10-20T01:02:03.000000+00:00",
  isMine: true,
  isPostAuthor: false,
  isWithdrawn: false,
  anonNumber: 1,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test("댓글은 공백·줄바꿈을 포함하고 NFC와 이모지를 같은 문자 기준으로 계산한다", () => {
  assert.equal(text.textLength("가\r\n\r\n👍🏽"), 4);
  assert.equal(text.textLength("e\u0301"), 1);
  assert.equal(text.textLength("가".repeat(29) + "\r\n"), 30);
  assert.equal(text.normalizeText("a\rb\r\nc"), "a\nb\nc");
});

test("HTTP(S)만 링크로 만들고 잘못된 URL과 주변 문장 부호는 본문으로 남긴다", () => {
  const { httpLinkParts } = load("src/utils/httpLinks.ts");
  const parts = httpLinkParts(
    "참고 (https://example.com/a). http://shop.test/path(foo) ftp://example.com https://[bad",
  );
  const links = parts.filter((part) => part.url);
  assert.equal(links.length, 2);
  assert.equal(links[0].text, "https://example.com/a");
  assert.equal(links[1].text, "http://shop.test/path(foo)");
  assert.equal(
    parts.map((part) => part.text).join(""),
    "참고 (https://example.com/a). http://shop.test/path(foo) ftp://example.com https://[bad",
  );
});

test("댓글 성공 응답은 익명 필드만 매핑하고 재시도 키와 정규화 본문을 전달한다", async () => {
  const calls = [];
  const api = load("src/screens/diggle/api/communityInteractions.ts", {
    "@/lib/supabase": {
      supabase: {
        rpc: async (name, args) => {
          calls.push({ name, args });
          return {
            data: {
              id: "90",
              created_at: row().createdAt,
              content: "é\n댓글",
              is_mine: true,
              is_post_author: false,
              is_withdrawn: false,
              anon_number: 1,
              author_id: "hidden",
            },
            error: null,
          };
        },
      },
    },
    "@/utils/text": text,
    "./community": keys,
  });
  const saved = await api.createComment("12", "e\u0301\r\n댓글", "request");
  assert.equal(saved.id, "90");
  assert.equal(saved.body, "é\n댓글");
  assert.equal("author_id" in saved, false);
  assert.equal(calls[0].args.comment_content, "é\n댓글");
  assert.equal(calls[0].args.request_id, "request");
  assert.deepEqual(Object.keys(calls[0].args).sort(), [
    "comment_content",
    "request_id",
    "target_post_id",
  ]);
  await assert.rejects(api.deleteComment("bad"), /invalid_post_id/);
});

test("성공한 신규 댓글을 합쳐도 다음 페이지 커서를 건너뛰거나 댓글을 중복 표시하지 않는다", () => {
  const { mergeComments } = load("src/screens/diggle/domain/comments.ts");
  const first = Array.from({ length: 20 }, (_, i) => row(String(i + 1)));
  assert.equal(mergeComments(first, { 26: row("26") }).length, 21);
  assert.equal(first.at(-1).id, "20", "서버 페이지는 변경하지 않는다");
  const loaded = [...first, ...Array.from({ length: 6 }, (_, i) => row(String(i + 21)))];
  const merged = mergeComments(loaded, { 26: row("26", "수정된 본문"), 2: null });
  assert.equal(merged.length, 25);
  assert.equal(merged.at(-1).body, "수정된 본문");
  assert.equal(
    merged.some((item) => item.id === "2"),
    false,
  );
});

function harness({
  create = async () => row(),
  update = async (id, body) => row(id, body),
  remove = async () => {},
  like = async (_id, liked) => ({ isLiked: liked, likeCount: 4 }),
} = {}) {
  const slots = [],
    effects = new Map();
  let index = 0,
    pending = [],
    dirty = false,
    uuid = 0;
  const calls = [],
    invalidations = [],
    toasts = [];
  let post = { id: "12", type: "post", isLiked: false, likeCount: 3, commentCount: 2 };
  const useState = (initial) => {
    const slot = index++;
    if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
    return [
      slots[slot],
      (next) => {
        slots[slot] = typeof next === "function" ? next(slots[slot]) : next;
        dirty = true;
      },
    ];
  };
  const mocks = {
    "react": {
      useState,
      useRef: (initial) => useState({ current: initial })[0],
      useEffect: (callback, deps) => {
        const slot = index++;
        const previous = effects.get(slot);
        if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i])))
          pending.push({ slot, callback, deps });
      },
    },
    "@tanstack/react-query": {
      useQueryClient: () => ({
        invalidateQueries: (input) => invalidations.push(input),
        setQueryData: (_key, updater) => {
          post = updater(post);
        },
      }),
    },
    "expo-crypto": { randomUUID: () => `request-${++uuid}` },
    "@/hooks/useToast": { useToast: () => (message) => toasts.push(message) },
    "@/utils/text": text,
    "../api/community": keys,
    "../api/communityWrite": { communityWriteError: () => "요청 실패" },
    "../api/communityInteractions": {
      createComment: (...args) => {
        calls.push({ type: "create", args });
        return create(...args);
      },
      updateComment: (...args) => {
        calls.push({ type: "update", args });
        return update(...args);
      },
      deleteComment: (...args) => {
        calls.push({ type: "delete", args });
        return remove(...args);
      },
      setCommunityLike: (...args) => {
        calls.push({ type: "like", args });
        return like(...args);
      },
    },
  };
  const comments = load("src/screens/diggle/hooks/useCommentActions.ts", mocks).useCommentActions;
  const likes = load("src/screens/diggle/hooks/useCommunityLike.ts", mocks).useCommunityLike;
  function render(kind = "comments", viewer = "viewer") {
    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      index = 0;
      pending = [];
      dirty = false;
      result = kind === "comments" ? comments("12", viewer) : likes(post, viewer);
      if (!dirty) break;
    }
    for (const { slot, callback, deps } of pending) {
      effects.get(slot)?.cleanup?.();
      effects.set(slot, { deps, cleanup: callback() });
    }
    return result;
  }
  return {
    render,
    calls,
    invalidations,
    toasts,
    setPost: (values) => {
      post = { ...post, ...values };
    },
    post: () => post,
    unmount: () => {
      for (const effect of effects.values()) effect.cleanup?.();
    },
  };
}

test("댓글 연타는 한 번만 전송하고 실패 시 본문과 재시도 키를 유지한다", async () => {
  const work = deferred();
  const ui = harness({ create: () => work.promise });
  ui.render().setBody("작성 중 댓글");
  const request = ui.render().send();
  await ui.render().send();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.render().isSending, true);
  work.reject(new Error("offline"));
  await request;
  assert.equal(ui.render().body, "작성 중 댓글");
  assert.equal(ui.invalidations.length, 0);
  await ui.render().send();
  assert.equal(ui.calls[0].args[2], ui.calls[1].args[2]);
});

test("댓글 성공 시에만 입력을 비우고 서버 행을 보존하며 조회를 갱신한다", async () => {
  const ui = harness();
  ui.render().setBody("작성한 댓글");
  await ui.render().send();
  assert.equal(ui.render().body, "");
  assert.equal(ui.render().changes["90"].id, "90");
  assert.equal(ui.invalidations.length, 1);
});

test("수정 취소는 작성 초안을 복원하고 실패하면 수정 본문을 유지하며 같은 본문도 저장한다", async () => {
  let shouldFail = true;
  const ui = harness({
    update: async (id, body) => {
      if (shouldFail) throw Error("offline");
      return row(id, body);
    },
  });
  ui.render().setBody("원래 초안");
  ui.render().startEditing(row());
  ui.render().setBody("수정 본문");
  await ui.render().send();
  assert.equal(ui.render().body, "수정 본문");
  assert.equal(ui.render().editing.id, "90");
  ui.render().cancelEditing();
  assert.equal(ui.render().body, "원래 초안");
  ui.render().startEditing(row());
  shouldFail = false;
  await ui.render().send();
  assert.equal(ui.calls.at(-1).args[1], "새 댓글");
  assert.equal(ui.render().editing, null);
  assert.equal(ui.render().body, "원래 초안");
});

test("댓글 삭제 실패는 확인창·목록을 유지하고 재시도 성공 후에만 제거한다", async () => {
  let shouldFail = true;
  const ui = harness({
    remove: async () => {
      if (shouldFail) throw Error("offline");
    },
  });
  ui.render().confirmDelete(row());
  await ui.render().remove();
  assert.equal(ui.render().deleteTarget.id, "90");
  assert.equal(ui.render().deleteError, "요청 실패");
  assert.equal("90" in ui.render().changes, false);
  shouldFail = false;
  await ui.render().remove();
  assert.equal(ui.render().deleteTarget, null);
  assert.equal(ui.render().changes["90"], null);
});

test("이전 계정의 늦은 댓글 응답이 새 계정의 초안·캐시를 변경하지 않는다", async () => {
  const work = deferred(),
    ui = harness({ create: () => work.promise });
  ui.render().setBody("이전 계정 초안");
  const request = ui.render().send();
  assert.equal(ui.render("comments", "other").body, "");
  work.resolve(row());
  await request;
  assert.equal(ui.invalidations.length, 0);
  assert.equal(ui.render("comments", "other").body, "");
  assert.equal(ui.toasts.length, 0);
});

test("좋아요 등록·취소 실패 시 아이콘과 개수를 원상 복구하고 연타를 막는다", async () => {
  for (const initial of [false, true]) {
    const work = deferred(),
      ui = harness({ like: () => work.promise });
    ui.setPost({ isLiked: initial });
    const request = ui.render("likes").toggle();
    await ui.render("likes").toggle();
    assert.equal(ui.calls.length, 1);
    assert.equal(ui.render("likes").isLiked, !initial);
    assert.equal(ui.render("likes").likeCount, initial ? 2 : 4);
    work.reject(Error("offline"));
    await request;
    assert.equal(ui.render("likes").isLiked, initial);
    assert.equal(ui.render("likes").likeCount, 3);
    assert.equal(ui.toasts.length, 1);
  }
});

test("좋아요 성공은 동시 갱신된 댓글 수를 보존하고 투표글·비회원은 요청하지 않는다", async () => {
  const work = deferred(),
    ui = harness({ like: () => work.promise });
  const request = ui.render("likes").toggle();
  ui.setPost({ commentCount: 9 });
  work.resolve({ isLiked: true, likeCount: 5 });
  await request;
  assert.equal(ui.post().isLiked, true);
  assert.equal(ui.post().likeCount, 5);
  assert.equal(ui.post().commentCount, 9);
  const blocked = harness();
  blocked.setPost({ type: "vote" });
  await blocked.render("likes").toggle();
  blocked.setPost({ type: "post" });
  await blocked.render("likes", null).toggle();
  assert.equal(blocked.calls.length, 0);
});
