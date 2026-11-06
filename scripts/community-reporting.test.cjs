/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { setImmediate } = require("node:timers");
const { runInNewContext } = require("node:vm");
const React = require("react");
const { QueryClient, QueryObserver } = require("@tanstack/react-query");
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
      require: (name) => mocks[name] ?? (name.endsWith(".svg") ? "Svg" : require(name)),
    },
  );
  return module.exports;
}
const constants = load("src/constants/report.ts");
const messages = load("src/constants/messages.ts");
const text = load("src/utils/text.ts");
const communityWrite = load("src/screens/diggle/api/communityWrite.ts", {
  "@/api/accountAccess": { restrictionMessage: () => null },
  "@/lib/supabase": { supabase: {} },
});
const community = load("src/screens/diggle/api/community.ts", {
  "@/lib/supabase": { supabase: {} },
});
const nodes = (node, type) =>
  React.isValidElement(node)
    ? [
        ...(node.type === type ? [node] : []),
        ...React.Children.toArray(node.props.children).flatMap((child) => nodes(child, type)),
      ]
    : [];
const settle = () => new Promise(setImmediate);
function harness({
  report = async () => {},
  block = async () => {},
  refresh = async () => {},
  os = "android",
  target = { type: "post", id: "12" },
  initialPhase = "report",
} = {}) {
  const slots = [],
    effects = new Map(),
    calls = [],
    toasts = [];
  let index = 0,
    pending = [],
    viewer = "viewer",
    closed = 0,
    invalidations = 0;
  const react = {
    ...React,
    useState: (initial) => {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [
        slots[i],
        (value) => {
          slots[i] = value;
        },
      ];
    },
    useRef: (initial) => {
      const i = index++;
      return (slots[i] ??= { current: initial });
    },
    useEffect: (callback, deps) => {
      const i = index++;
      if (!effects.has(i) || deps.some((value, j) => !Object.is(value, effects.get(i).deps[j])))
        pending.push({ i, callback, deps });
    },
  };
  const client = {
    invalidateQueries: async (...args) => {
      invalidations++;
      assert.equal(args[1].throwOnError, true);
      return refresh(...args);
    },
  };
  const { ReportDialog } = load("src/components/ReportFlow.tsx", {
    react,
    "react-native": { Text: "Text", View: "View", Platform: { OS: os } },
    "@/components/modal/Modal": { Modal: "Modal" },
    "@/components/modal/ModalButton": { ModalButton: "ModalButton" },
    "@/components/modal/ReportModal": { ReportForm: "ReportForm" },
    "@/constants/messages": messages,
    "@/constants/report": constants,
    "@/contexts/AuthContext": {
      useAuth: () => ({ session: viewer ? { user: { id: viewer } } : null }),
    },
    "@/hooks/useToast": { useToast: () => (message) => toasts.push(message) },
    "@tanstack/react-query": { useQueryClient: () => client },
    "@/screens/diggle/api/community": community,
    "@/screens/diggle/api/communityReporting": {
      reportCommunityContent: (...args) => {
        calls.push({ type: "report", args });
        return report(...args);
      },
      blockCommunityAuthor: (...args) => {
        calls.push({ type: "block", args });
        return block(...args);
      },
    },
    "@/screens/diggle/api/communityWrite": communityWrite,
  });
  const close = () => closed++;
  return {
    render(nextViewer = viewer) {
      viewer = nextViewer;
      index = 0;
      pending = [];
      const tree = ReportDialog({ target, onClose: close, initialPhase });
      for (const { i, callback, deps } of pending) {
        effects.get(i)?.cleanup?.();
        effects.set(i, { deps, cleanup: callback() });
      }
      return tree;
    },
    calls,
    toasts,
    closed: () => closed,
    invalidations: () => invalidations,
    unmount() {
      for (const effect of effects.values()) effect.cleanup?.();
    },
  };
}

test("신고·차단 API는 글/댓글 ID만 보내고 작성자 UUID를 받거나 전달하지 않는다", async () => {
  const calls = [];
  let failure = null;
  const api = load("src/screens/diggle/api/communityReporting.ts", {
    "@/lib/supabase": {
      supabase: {
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data: "7", error: failure };
        },
      },
    },
    "./community": community,
    "@/utils/text": text,
  });
  await api.reportCommunityContent({ type: "comment", id: "12" }, "other", " e\u0301\r\n상세 ");
  assert.equal(calls[0].args.report_detail, "é\n상세");
  assert.deepEqual(Object.keys(calls[0].args).sort(), [
    "report_detail",
    "report_reason",
    "target_id",
    "target_type",
  ]);
  await api.blockCommunityAuthor({ type: "comment", id: "12" });
  assert.deepEqual(Object.keys(calls[1].args).sort(), ["target_id", "target_type"]);
  failure = { message: "failed" };
  await assert.rejects(
    api.blockCommunityAuthor({ type: "post", id: "12" }),
    (error) => error === failure,
  );
  await assert.rejects(api.reportCommunityContent({ type: "post", id: "bad" }, "spam", ""));
});

test("독립 차단은 신고를 만들지 않고 확인 후 차단·캐시 갱신하며 취소·실패를 처리한다", async () => {
  const cancelled = harness({ initialPhase: "block" });
  assert.equal(nodes(cancelled.render(), "ReportForm").length, 0);
  assert.equal(
    nodes(cancelled.render(), "Text")[0].props.children,
    constants.REPORT_MESSAGES.directBlockTitle,
  );
  nodes(cancelled.render(), "ModalButton")[0].props.action.onPress();
  assert.equal(cancelled.closed(), 1);
  assert.equal(cancelled.calls.length, 0);
  let fail = true;
  const ui = harness({
    initialPhase: "block",
    block: async () => {
      if (fail) throw Error("offline");
    },
  });
  nodes(ui.render(), "ModalButton")[1].props.action.onPress();
  await settle();
  assert.equal(ui.closed(), 0);
  assert.equal(ui.render().props.toastMessage, constants.REPORT_MESSAGES.blockFailed);
  fail = false;
  nodes(ui.render(), "ModalButton")[1].props.action.onPress();
  await settle();
  assert.deepEqual(
    ui.calls.map((c) => c.type),
    ["block", "block"],
  );
  assert.equal(ui.invalidations(), 1);
  assert.equal(ui.closed(), 1);
});

test("직접 차단 취소 버튼은 취소로 표시한다", () => {
  const ui = harness({ initialPhase: "block" });
  assert.equal(nodes(ui.render(), "ModalButton")[0].props.action.label, "취소");
});

test("차단 대상이 삭제되면 모달을 닫고 목록을 갱신하며 차단 성공으로 알리지 않는다", async () => {
  for (const type of ["post", "comment"]) {
    const ui = harness({
      initialPhase: "block",
      target: { type, id: "12" },
      block: async () => {
        throw { message: "report_target_not_found", code: "42501" };
      },
    });
    nodes(ui.render(), "ModalButton")[1].props.action.onPress();
    await settle();
    assert.equal(ui.closed(), 1);
    assert.equal(ui.invalidations(), 1);
    assert.deepEqual(ui.toasts, ["삭제되었거나 더 이상 볼 수 없는 콘텐츠입니다."]);
  }
});

test("차단 실패는 이용 제한·정책·네트워크를 구분하고 일반 실패만 차단 실패 문구를 사용한다", async () => {
  for (const message of [
    "community_restricted",
    "not_authorized",
    "community_policy_required",
    "Failed to fetch",
    "failed",
  ]) {
    const ui = harness({
      initialPhase: "block",
      block: async () => {
        throw { message };
      },
    });
    nodes(ui.render(), "ModalButton")[1].props.action.onPress();
    await settle();
    assert.equal(
      ui.render().props.toastMessage,
      communityWrite.communityWriteError({ message }, constants.REPORT_MESSAGES.blockFailed),
    );
    assert.equal(ui.closed(), 0);
    assert.equal(ui.invalidations(), 0);
  }
});

test("삭제 대상 처리 후 재조회가 실패해도 모달을 다시 열거나 차단 성공을 알리지 않는다", async () => {
  const ui = harness({
    initialPhase: "block",
    block: async () => {
      throw { message: "report_target_not_found" };
    },
    refresh: async () => {
      throw Error("Failed to fetch");
    },
  });
  nodes(ui.render(), "ModalButton")[1].props.action.onPress();
  await settle();
  assert.equal(ui.closed(), 1);
  assert.equal(ui.invalidations(), 1);
  assert.equal(ui.toasts.includes(messages.DIGGLE_TOAST_MESSAGES.REPORT_004), false);
  assert.equal(ui.toasts.at(-1), "연결 상태를 확인한 후 다시 시도해 주세요.");
});

test("차단 대상 삭제 응답도 계정 변경·화면 이탈 후에는 목록·모달·토스트를 바꾸지 않는다", async () => {
  for (const unmount of [true, false]) {
    let reject;
    const ui = harness({
      initialPhase: "block",
      block: () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    });
    nodes(ui.render(), "ModalButton")[1].props.action.onPress();
    if (unmount) ui.unmount();
    else ui.render("other");
    const closed = ui.closed();
    reject({ message: "report_target_not_found" });
    await settle();
    assert.equal(ui.closed(), closed);
    assert.equal(ui.invalidations(), 0);
    assert.equal(ui.toasts.length, 0);
  }
});

test("신고 성공 뒤 차단 확인을 한 번 표시하고 확인은 차단을 요청하지 않는다", async () => {
  const ui = harness();
  let tree = ui.render();
  assert.equal(tree.type, "Modal");
  assert.equal(tree.props.isKeyboardAvoiding, true);
  // BUG-051 iOS도 직접 작성 중 입력칸이 키보드에 가려지지 않게 모달을 키보드 위로 올린다.
  assert.equal(harness({ os: "ios" }).render().props.isKeyboardAvoiding, true);
  nodes(tree, "ReportForm")[0].props.onReport("spam", "");
  await settle();
  tree = ui.render();
  assert.equal(nodes(tree, "ReportForm").length, 0);
  assert.ok(
    nodes(tree, "Text").some((node) => node.props.children === constants.REPORT_MESSAGES.title),
  );
  nodes(tree, "ModalButton")
    .find((node) => node.props.action.label === "확인")
    .props.action.onPress();
  assert.equal(ui.closed(), 1);
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.invalidations(), 1);
});

test("BUG-108: 댓글 신고는 그 댓글만, 차단은 이전 화면 캐시의 작성자 콘텐츠까지 갱신한다", async (t) => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  let reported = false;
  let blocked = false;
  const posts = [
    { id: "21", type: "post" },
    { id: "22", type: "vote" },
    { id: "23", type: "other" },
  ];
  const feed = {
    queryKey: community.communityKeys.feed("viewer", "all"),
    queryFn: async () => ({ pages: [blocked ? posts.slice(2) : posts], pageParams: [null] }),
  };
  const comments = {
    queryKey: community.communityKeys.comments("viewer", "23"),
    queryFn: async () => ({
      pages: [
        blocked
          ? ["other"]
          : reported
            ? ["same-author", "reply", "other"]
            : ["reported", "same-author", "reply", "other"],
      ],
      pageParams: [null],
    }),
  };
  const detail = {
    queryKey: community.communityKeys.post("viewer", "21"),
    queryFn: async () => (blocked ? null : posts[0]),
  };
  const votes = {
    queryKey: community.communityKeys.feed("viewer", "vote"),
    queryFn: async () => ({ pages: [blocked ? [] : [posts[1]]], pageParams: [null] }),
  };
  const activity = {
    queryKey: community.communityKeys.activity("viewer", "liked"),
    queryFn: async () => ({ pages: [blocked ? [] : [posts[0]]], pageParams: [null] }),
  };
  await Promise.all(
    [feed, comments, detail, votes, activity].map((query) => cache.fetchQuery(query)),
  );
  // 댓글 화면만 활성 상태이고, 돌아갈 피드·상세 화면은 캐시만 남아 있다.
  const observer = new QueryObserver(cache, { ...comments, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  t.after(() => {
    unsubscribe();
    cache.clear();
  });
  const ui = harness({
    target: { type: "comment", id: "12" },
    report: async () => {
      reported = true;
    },
    block: async () => {
      blocked = true;
    },
    refresh: (...args) => cache.invalidateQueries(...args),
  });
  nodes(ui.render(), "ReportForm")[0].props.onReport("spam", "");
  await settle();
  assert.deepEqual(cache.getQueryData(comments.queryKey).pages[0], [
    "same-author",
    "reply",
    "other",
  ]);
  assert.equal(
    cache.getQueryData(feed.queryKey).pages[0].length,
    3,
    "댓글 신고만으로 작성자 글을 숨기지 않는다",
  );
  nodes(ui.render(), "ModalButton")
    .find((node) => node.props.action.label === "차단하기")
    .props.action.onPress();
  await settle();
  assert.deepEqual(
    cache.getQueryData(feed.queryKey).pages[0],
    posts.slice(2),
    "차단 완료 시 비활성 피드에서도 작성자 게시글·투표글을 제거한다",
  );
  assert.equal(
    cache.getQueryData(detail.queryKey),
    null,
    "이전 상세 화면에도 차단 작성자의 글을 남기지 않는다",
  );
  assert.deepEqual(cache.getQueryData(comments.queryKey).pages[0], ["other"]);
  assert.deepEqual(cache.getQueryData(votes.queryKey).pages[0], []);
  assert.deepEqual(cache.getQueryData(activity.queryKey).pages[0], []);
  assert.equal(ui.closed(), 1);
});

test("신고 실패는 폼과 입력을 유지하고 재시도 성공 후에만 차단 확인으로 넘어간다", async () => {
  let fails = true;
  const ui = harness({
    report: async () => {
      if (fails) throw Error("offline");
    },
  });
  nodes(ui.render(), "ReportForm")[0].props.onReport("other", "초안");
  await settle();
  let tree = ui.render();
  assert.equal(tree.props.toastMessage, communityWrite.communityWriteError(Error("offline")));
  assert.equal(ui.closed(), 0);
  fails = false;
  nodes(tree, "ReportForm")[0].props.onReport("other", "초안");
  await settle();
  tree = ui.render();
  assert.equal(nodes(tree, "ReportForm").length, 0);
  assert.equal(ui.calls[1].args[2], "초안");
});

test("연타·요청 중 닫기는 차단하고 차단 실패를 성공으로 표시하지 않는다", async () => {
  let release;
  const pending = new Promise((resolve) => (release = resolve));
  let failBlock = true;
  const ui = harness({
    report: () => pending,
    block: async () => {
      if (failBlock) throw Error("failed");
    },
  });
  let tree = ui.render(),
    form = nodes(tree, "ReportForm")[0];
  form.props.onReport("spam", "");
  form.props.onReport("spam", "");
  tree.props.onRequestClose();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.closed(), 0);
  release();
  await settle();
  tree = ui.render();
  let button = nodes(tree, "ModalButton").find((node) => node.props.action.label === "차단하기");
  button.props.action.onPress();
  await settle();
  tree = ui.render();
  assert.equal(ui.toasts.length, 0);
  assert.equal(ui.closed(), 0);
  assert.equal(tree.props.toastMessage, constants.REPORT_MESSAGES.blockFailed);
  failBlock = false;
  nodes(tree, "ModalButton")
    .find((node) => node.props.action.label === "차단하기")
    .props.action.onPress();
  await settle();
  assert.equal(ui.toasts[0], messages.DIGGLE_TOAST_MESSAGES.REPORT_004);
  assert.equal(ui.closed(), 1);
});

test("서버 저장 후 필터 재조회 실패도 완료로 처리하지 않고 재시도한다", async () => {
  const ui = harness({
    refresh: async () => {
      throw Error("refresh failed");
    },
  });
  nodes(ui.render(), "ReportForm")[0].props.onReport("spam", "");
  await settle();
  assert.equal(nodes(ui.render(), "ReportForm").length, 1);
  assert.equal(ui.closed(), 0);
  assert.equal(ui.toasts.length, 0);
});

test("계정 변경·화면 이탈 뒤 응답은 새 계정의 모달·토스트·목록을 바꾸지 않는다", async () => {
  for (const unmount of [true, false]) {
    let release;
    const pending = new Promise((resolve) => (release = resolve));
    const ui = harness({ report: () => pending });
    nodes(ui.render(), "ReportForm")[0].props.onReport("spam", "");
    if (unmount) ui.unmount();
    else assert.equal(ui.render("other").props.visible, false);
    release();
    await settle();
    assert.equal(ui.invalidations(), 0);
    assert.equal(ui.toasts.length, 0);
  }
});

test("신고 사유 모달에 신고 대상 종류를 넘긴다", () => {
  assert.equal(nodes(harness().render(), "ReportForm")[0].props.targetType, "post");
  const comment = harness({ target: { type: "comment", id: "12" } });
  assert.equal(nodes(comment.render(), "ReportForm")[0].props.targetType, "comment");
});

test("직접 작성은 0~50 사용자 인식 문자이고 실패·로딩 중 입력이 보존된다", () => {
  const slots = [];
  let index = 0;
  const { ReportForm } = load("src/components/modal/ReportModal.tsx", {
    "react": {
      ...React,
      useState: (initial) => {
        const i = index++;
        if (!(i in slots)) slots[i] = initial;
        return [slots[i], (value) => (slots[i] = value)];
      },
    },
    "react-native": { Text: "Text", View: "View", TextInput: "TextInput", Pressable: "Pressable" },
    "nativewind": { cssInterop: (value) => value },
    "@/constants/report": constants,
    "@/utils/text": text,
    "@/theme": { colors: { gray: { 400: "gray" } } },
    "./Modal": { Modal: "Modal" },
    "./ModalButton": { ModalButton: "ModalButton" },
  });
  const sent = [];
  function render(props = {}) {
    index = 0;
    return ReportForm({ onCancel() {}, onReport: (...args) => sent.push(args), ...props });
  }
  const labels = (tree) =>
    nodes(tree, "Text")
      .map((node) => node.props.children)
      .filter((label) => typeof label === "string")
      .slice(1, 5);
  // BUG-111 RPT-002 Figma: 댓글 신고는 '게시글'을 '댓글'로 바꿔 보여준다.
  assert.deepEqual(labels(render()), [
    "욕설, 비방, 인신 공격",
    "게시글 도배",
    "부적절한 게시글 (선정적 / 홍보 / 유언비어 / 초상권 위배 등)",
    "직접 작성",
  ]);
  assert.deepEqual(labels(render({ targetType: "comment" })), [
    "욕설, 비방, 인신 공격",
    "댓글 도배",
    "부적절한 댓글 (선정적 / 홍보 / 유언비어 / 초상권 위배 등)",
    "직접 작성",
  ]);
  let tree = render();
  nodes(tree, "Pressable")[3].props.onPress();
  tree = render();
  let submit = nodes(tree, "ModalButton")[1];
  assert.equal(submit.props.action.isDisabled, false);
  submit.props.action.onPress();
  assert.equal(sent[0][0], "other");
  assert.equal(sent[0][1], "");
  nodes(tree, "TextInput")[0].props.onChangeText("👍🏽".repeat(51));
  tree = render({ error: "실패" });
  assert.equal(text.textLength(nodes(tree, "TextInput")[0].props.value), 50);
  tree = render({ isPending: true });
  assert.equal(nodes(tree, "TextInput")[0].props.editable, false);
  assert.equal(nodes(tree, "ModalButton")[1].props.action.isDisabled, true);
  assert.equal(text.textLength(nodes(tree, "TextInput")[0].props.value), 50);
});
