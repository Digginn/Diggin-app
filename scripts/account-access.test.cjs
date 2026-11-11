/* global __dirname, setImmediate */
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
    { module, exports: module.exports, require: (name) => mocks[name] ?? require(name) },
  );
  return module.exports;
}
const messages = load("src/screens/diggle/utils/sanctionMessages.ts");
function accountApi(status = "active") {
  const calls = [];
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { access_token: "captured-token" } } }) },
    rpc: (name, args) => {
      const call = { name, args, headers: {} };
      calls.push(call);
      const result = Promise.resolve({
        data:
          name === "get_account_access"
            ? {
                status,
                restricted_until: status === "community_restricted" ? "2026-10-23T14:59:59Z" : null,
              }
            : "1",
        error: null,
      });
      result.setHeader = (key, value) => {
        call.headers[key] = value;
        return result;
      };
      return result;
    },
  };
  return {
    calls,
    supabase,
    api: load("src/api/accountAccess.ts", {
      "@/lib/supabase": { supabase },
      "@/screens/diggle/utils/sanctionMessages": messages,
    }),
  };
}
test("유효하지 않은 상태·종료일·제재 ID를 허용 상태로 해석하지 않는다", () => {
  const { api } = accountApi();
  for (const value of [
    { status: "unknown" },
    { status: "community_restricted" },
    { status: "active", restricted_until: "invalid" },
    { status: "warning", sanction_id: 9007199254740992 },
    { status: "suspended", reason_category: "guessed" },
  ])
    assert.throws(() => api.parseAccountAccess(value), /invalid_account_access/);
});
test("허용된 요청은 사전 검사에 사용한 계정 토큰을 보존한다", async () => {
  const fixture = accountApi();
  const write = load("src/screens/diggle/api/communityWrite.ts", {
    "@/api/accountAccess": fixture.api,
    "@/lib/supabase": { supabase: fixture.supabase },
  });
  await write.deleteCommunityPost("1");
  assert.deepEqual(
    fixture.calls.map((call) => call.name),
    ["get_account_access", "delete_community_post"],
  );
  assert.ok(fixture.calls.every((call) => call.headers.Authorization === "Bearer captured-token"));
});
test("기간 제한은 모든 변경 요청을 보내기 전에 차단하며 종료일 Toast를 만든다", async () => {
  const fixture = accountApi("community_restricted");
  const mocks = {
    "@/utils/text": { normalizeText: (value) => value },
    "@/api/accountAccess": fixture.api,
    "@/lib/supabase": { supabase: fixture.supabase },
    "./community": {
      databaseId: Number,
      parseCommunityComment: (value) => value,
      parsePost: (value) => value,
    },
  };
  const write = load("src/screens/diggle/api/communityWrite.ts", mocks);
  const interactions = load("src/screens/diggle/api/communityInteractions.ts", mocks);
  const vote = load("src/screens/diggle/api/communityVote.ts", mocks);
  for (const action of [
    () => write.agreeCommunityPolicy(),
    () =>
      write.createCommunityPost({
        type: "post",
        body: "본문 내용",
        productIds: ["1"],
        requestId: "request",
      }),
    () => write.deleteCommunityPost("1"),
    () => interactions.createComment("1", "댓글", "request"),
    () => interactions.updateComment("1", "수정"),
    () => interactions.deleteComment("1"),
    () => interactions.setCommunityLike("1", true),
    () => interactions.setCommunityLike("1", false),
    () => vote.setCommunityVote("1", "buy"),
  ]) {
    try {
      await action();
      assert.fail("must_reject");
    } catch (error) {
      assert.equal(error.message, "community_restricted");
      assert.equal(
        fixture.api.restrictionMessage(error),
        messages.restrictionToastMessage("2026-10-23T14:59:59Z"),
      );
    }
  }
  assert.ok(fixture.calls.every((call) => call.name === "get_account_access"));
});
test("영구 제한은 기간 제한으로 오인하지 않고 쓰기를 거부한다", async () => {
  const { api } = accountApi("suspended");
  await assert.rejects(api.ensureCommunityWriteAllowed(), /suspended/);
  assert.equal(api.restrictionMessage(new Error("suspended")), null);
});

function noticeHarness() {
  const state = [],
    refs = [],
    effects = [];
  let cursor = 0,
    refCursor = 0,
    effectCursor = 0,
    pending = [];
  let viewer = "viewer",
    pathname = "/all",
    value = { status: "warning", sanctionId: "1", noticeSeenAt: null, reasonCategory: "abuse" };
  let suspension = null,
    acks = 0,
    resolveAck,
    rejectAck,
    cacheSets = 0,
    confirmed = 0;
  const routes = [];
  let isFetching = false,
    queryOptions,
    appListener,
    refetches = 0;
  const refetch = async () => {
    refetches++;
  };
  const endSuspendedSession = async (access) => {
    suspension = access;
    viewer = null;
  };
  const { AccountAccessNotice } = load("src/components/AccountAccessNotice.tsx", {
    "react": {
      ...React,
      useState: (initial) => {
        const i = cursor++;
        if (!(i in state)) state[i] = initial;
        return [
          state[i],
          (next) => {
            state[i] = typeof next === "function" ? next(state[i]) : next;
          },
        ];
      },
      useRef: (initial) => {
        const i = refCursor++;
        return (refs[i] ??= { current: initial });
      },
      useEffect: (effect, deps) => {
        const i = effectCursor++,
          old = effects[i];
        if (!old || deps.some((dep, j) => dep !== old.deps[j]))
          pending.push(() => {
            old?.cleanup?.();
            effects[i] = { deps, cleanup: effect() };
          });
      },
    },
    "@tanstack/react-query": {
      useQuery: (options) => {
        queryOptions = options;
        return { data: viewer ? value : undefined, isFetching, refetch };
      },
      useQueryClient: () => ({
        setQueryData: (_key, next) => {
          cacheSets++;
          value = next;
        },
      }),
    },
    "expo-router": {
      usePathname: () => pathname,
      useRouter: () => ({ replace: (path) => routes.push(path) }),
    },
    "react-native": {
      AppState: {
        addEventListener: (_event, listener) => {
          appListener = listener;
          return {
            remove() {
              appListener = null;
            },
          };
        },
      },
    },
    "@/api/accountAccess": {
      fetchAccountAccess: async () => value,
      acknowledgeSanction: () => {
        acks++;
        return new Promise((resolve, reject) => {
          resolveAck = resolve;
          rejectAck = reject;
        });
      },
      SANCTION_REASON_LABELS: { abuse: "욕설, 비방, 인신 공격" },
    },
    "@/contexts/AuthContext": {
      useAuth: () => ({
        session: viewer ? { user: { id: viewer } } : null,
        suspension,
        endSuspendedSession,
        confirmSuspension: () => {
          confirmed++;
          suspension = null;
        },
      }),
    },
    "@/contexts/BrowsingModeContext": { useBrowsingMode: () => ({ setIsGuest: () => {} }) },
    "@/screens/diggle/components/SanctionNoticeModal": {
      SanctionNoticeModal: "SanctionNoticeModal",
    },
    "@/components/UnderageNoticeModal": { UnderageNoticeModal: "UnderageNoticeModal" },
  });
  return {
    render() {
      cursor = refCursor = effectCursor = 0;
      pending = [];
      const tree = AccountAccessNotice();
      pending.forEach((effect) => effect());
      return tree;
    },
    setFetching(value) {
      isFetching = value;
    },
    appState(value) {
      appListener?.(value);
    },
    get queryOptions() {
      return queryOptions;
    },
    get refetches() {
      return refetches;
    },
    setPath(path) {
      pathname = path;
    },
    setViewer(id) {
      viewer = id;
    },
    setAccess(access) {
      value = access;
    },
    resolve() {
      resolveAck();
    },
    reject() {
      rejectAck(new Error("offline"));
    },
    get acks() {
      return acks;
    },
    get cacheSets() {
      return cacheSets;
    },
    get routes() {
      return routes;
    },
    get confirmed() {
      return confirmed;
    },
  };
}
const settle = () => new Promise(setImmediate);
test("경고는 DIGGLE 진입에만 안내하고 확인 실패는 유지·재시도하며 건별 확인한다", async () => {
  const harness = noticeHarness();
  assert.equal(harness.render(), null);
  harness.setPath("/diggle");
  let tree = harness.render();
  assert.equal(tree.props.notice.type, "warning");
  tree.props.onConfirm();
  tree.props.onConfirm();
  assert.equal(harness.acks, 1);
  harness.reject();
  await settle();
  tree = harness.render();
  assert.match(tree.props.confirmationError, /다시 시도/);
  tree.props.onConfirm();
  harness.resolve();
  await settle();
  assert.equal(harness.render(), null);
  harness.setAccess({ status: "warning", sanctionId: "2", noticeSeenAt: null });
  assert.ok(harness.render());
});
test("확인 요청 후 계정이 바뀌면 늦은 응답은 새 계정 캐시를 바꾸지 않는다", async () => {
  const harness = noticeHarness();
  harness.setPath("/diggle");
  harness.render().props.onConfirm();
  harness.setViewer("other");
  harness.render();
  harness.resolve();
  await settle();
  assert.equal(harness.cacheSets, 0);
});
test("영구 제한은 DIGGLE 밖에서도 세션 종료·비회원 로그인 화면 전환·별도 확인을 한다", async () => {
  const harness = noticeHarness();
  harness.setAccess({ status: "suspended", sanctionId: "3", reasonCategory: "abuse" });
  harness.render();
  await settle();
  const tree = harness.render();
  assert.equal(tree.props.notice.type, "suspended");
  assert.deepEqual(harness.routes, ["/login"]);
  tree.props.onConfirm();
  assert.equal(harness.confirmed, 1);
});

test("만 14세 미만으로 이용 중단된 계정은 제재 안내 대신 이용 중단 안내를 띄운다", async () => {
  const harness = noticeHarness();
  harness.setAccess({ status: "suspended", sanctionId: "4", reasonCategory: "underage" });
  harness.render();
  await settle();
  const tree = harness.render();
  assert.equal(tree.type, "UnderageNoticeModal");
  assert.deepEqual(harness.routes, ["/login"]);
  tree.props.onConfirm();
  assert.equal(harness.confirmed, 1);
});
test("서버가 보낸 만 14세 미만 사유를 그대로 읽는다", () => {
  const { api } = accountApi();
  assert.equal(
    api.parseAccountAccess({ status: "suspended", reason_category: "underage" }).reasonCategory,
    "underage",
  );
});

test("재조회 중 경고·7일 제한 모달을 유지하고 확인·해제 응답에서 닫는다", () => {
  for (const status of ["warning", "community_restricted"]) {
    const harness = noticeHarness();
    harness.setPath("/diggle");
    const access = {
      status,
      sanctionId: "1",
      noticeSeenAt: null,
      restrictedUntil: "2026-10-30T00:00:00Z",
    };
    harness.setAccess(access);
    assert.equal(harness.render().props.notice.type, status);
    harness.setFetching(true);
    assert.equal(harness.render()?.props.notice.type, status);
    harness.setFetching(false);
    harness.setAccess({ ...access, noticeSeenAt: "2026-10-22T00:00:00Z" });
    assert.equal(harness.render(), null);
    harness.setAccess(access);
    assert.ok(harness.render());
    harness.setAccess({ status: "active", sanctionId: null });
    assert.equal(harness.render(), null);
  }
});
test("주기 조회 없이 화면 이동·앱 복귀에 상태를 다시 조회한다", () => {
  const harness = noticeHarness();
  harness.render();
  assert.equal(harness.queryOptions.refetchInterval ?? false, false);
  const before = harness.refetches;
  harness.setPath("/diggle");
  harness.render();
  assert.equal(harness.refetches, before + 1);
  harness.appState("background");
  assert.equal(harness.refetches, before + 1);
  harness.appState("active");
  assert.equal(harness.refetches, before + 2);
});
