/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

const analyticsEvents = [];
const analytics = {
  trackEvent: (name, properties) => analyticsEvents.push([name, properties]),
  flushAnalytics: async () => {},
  setAnalyticsUser() {},
};

const LOGIN_SOURCES = {
  "@/lib/loginIntent": "src/lib/loginIntent.ts",
  "@/hooks/useLoginGate": "src/hooks/useLoginGate.tsx",
};

function load(file, mocks = {}) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "..", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) =>
        mocks[name] ??
        (name === "@/lib/analytics" ? analytics : undefined) ??
        (name === "@/api/accountAccess"
          ? { ensureCommunityWriteAllowed: async () => undefined, restrictionMessage: () => null }
          : LOGIN_SOURCES[name]
            ? load(LOGIN_SOURCES[name], mocks)
            : require(name)),
    },
  );
  return module.exports;
}
function nodes(node, type) {
  if (!React.isValidElement(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap((child) => nodes(child, type)),
  ];
}
const body = load("src/screens/diggle/domain/postBody.ts");
const settle = () => new Promise(setImmediate);

test("본문은 NFC·사용자 인식 문자 기준이며 공백을 제외하고 이모지 중간을 자르지 않는다", () => {
  assert.equal(body.postBodyLength("가 나\n다\t라 👨‍👩‍👧‍👦"), 5);
  assert.equal(body.postBodyLength("👍🏽🇰🇷1️⃣"), 3);
  assert.equal(body.postBodyLength("e\u0301"), 1);
  assert.equal(body.postBodyLength(" \u00a0\u3000"), 0);
  assert.equal(body.limitPostBody("가".repeat(49) + "👨‍👩‍👧‍👦끝"), "가".repeat(49) + "👨‍👩‍👧‍👦");
  assert.equal(body.limitPostBody("e\u0301"), "é");
});

test("입력창은 50자 초과를 반영하지 않고 테두리·카운터를 표시한 뒤 삭제하면 복구한다", () => {
  let overflow = false,
    value = "가".repeat(50);
  const { CommunityBodyField } = load("src/screens/diggle/components/CommunityBodyField.tsx", {
    "react": {
      useState: () => [
        overflow,
        (next) => {
          overflow = next;
        },
      ],
    },
    "react-native": { View: "View", Text: "Text", TextInput: "TextInput" },
    "@/theme": { colors: { gray: { 400: "gray" } } },
    "../domain/postBody": body,
  });
  const render = () =>
    CommunityBodyField({
      value,
      onChangeText: (next) => {
        value = next;
      },
      isVote: false,
    });
  nodes(render(), "TextInput")[0].props.onChangeText(value + "끝");
  assert.equal(body.postBodyLength(value), 50);
  assert.match(render().props.className, /border-semantic-error/);
  assert.match(nodes(render(), "Text")[0].props.className, /text-semantic-error/);
  value = "가".repeat(49) + "끝";
  const fullBody = value;
  for (const position of [0, 25, 50]) {
    const next = fullBody.slice(0, position) + "새" + fullBody.slice(position);
    nodes(render(), "TextInput")[0].props.onChangeText(next);
    assert.equal(value, fullBody, "50자에서 한 글자를 삽입해도 기존 본문을 유지한다");
  }
  nodes(render(), "TextInput")[0].props.onChangeText("👨‍👩‍👧‍👦" + fullBody);
  assert.equal(value, fullBody, "조합 이모지 한 글자도 기존 본문을 밀어내지 않는다");
  nodes(render(), "TextInput")[0].props.onChangeText("나" + fullBody.slice(1));
  assert.equal(value, "나" + fullBody.slice(1), "50자에서도 선택한 글자는 교체할 수 있다");
  nodes(render(), "TextInput")[0].props.onChangeText("붙여넣기" + fullBody);
  assert.equal(
    value,
    body.limitPostBody("붙여넣기" + fullBody),
    "여러 글자 붙여넣기는 50자로 자른다",
  );
  nodes(render(), "TextInput")[0].props.onChangeText("가".repeat(49));
  assert.doesNotMatch(render().props.className, /border-semantic-error/);
  nodes(render(), "TextInput")[0].props.onChangeText("👍🏽".repeat(70));
  assert.equal(value, "👍🏽".repeat(50));
  // BUG-094 5자 미만은 아래 안내만 띄우고, 카운터는 n/50자·기본 색을 유지한다.
  overflow = false;
  value = "가나";
  const short = render();
  assert.doesNotMatch(short.props.className, /border-semantic-error/);
  const counter = nodes(short, "Text")[0];
  assert.doesNotMatch(counter.props.className, /text-semantic-error/);
  assert.equal(counter.props.children.join(""), "2/50자");
});

test("등록 API는 본문·상품 ID·재시도 키만 전달하고 상품 정보는 클라이언트에서 보내지 않는다", async () => {
  let args;
  const api = load("src/screens/diggle/api/communityWrite.ts", {
    "@/lib/supabase": {
      supabase: {
        rpc: async (name, input) => {
          args = { name, input };
          return { data: "12", error: null };
        },
      },
    },
  });
  assert.equal(
    await api.createCommunityPost({
      type: "post",
      body: "정상적인 본문",
      productIds: ["1"],
      requestId: "uuid",
    }),
    "12",
  );
  assert.equal(args.name, "create_post");
  assert.deepEqual(Object.keys(args.input).sort(), [
    "post_content",
    "post_kind",
    "product_ids",
    "request_id",
  ]);
  await assert.rejects(
    api.createCommunityPost({
      type: "post",
      body: "정상적인 본문",
      productIds: ["bad"],
      requestId: "uuid",
    }),
    /invalid_product_id/,
  );
});

function editor({ isVote = false, agreed = true, save, agree } = {}) {
  const state = [];
  const effects = [];
  let index = 0,
    uuid = 0,
    destination,
    prevented;
  let policy = agreed;
  let items = [{ id: "1", imageUrl: null }];
  const calls = [],
    toasts = [],
    invalidations = [];
  const useSlot = (initial) => {
    const slot = index++;
    if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
    return [
      state[slot],
      (next) => {
        state[slot] = typeof next === "function" ? next(state[slot]) : next;
      },
    ];
  };
  const api = {
    fetchCommunityPolicy: async () => policy,
    agreeCommunityPolicy: agree ?? (async () => {}),
    communityWriteError: () => "다시 시도해 주세요.",
    createCommunityPost: async (input) => {
      calls.push(input);
      return save ? save(input) : "12";
    },
  };
  const { PostWriteScreen } = load("src/screens/diggle/PostWriteScreen.tsx", {
    "react": {
      useState: useSlot,
      useRef: (initial) => useSlot({ current: initial })[0],
      useEffect: (effect) => effects.push(effect),
      useCallback: (cb) => cb,
    },
    "@tanstack/react-query": {
      useQuery: () => ({ data: policy }),
      useQueryClient: () => ({
        setQueryData: (_key, value) => {
          policy = value;
        },
        invalidateQueries: (input) => invalidations.push(input),
      }),
    },
    "expo-crypto": { randomUUID: () => `request-${++uuid}` },
    "expo-router": {
      useRouter: () => ({
        dismissTo: (route) => {
          destination = route;
        },
        push: () => {},
      }),
      useFocusEffect: () => {},
      useIsFocused: () => true,
    },
    "expo-router/react-navigation": {
      usePreventRemove: (value, callback) => {
        prevented = value ? callback : null;
      },
    },
    "react-native": {
      View: "View",
      Text: "Text",
      ScrollView: "ScrollView",
      KeyboardAvoidingView: "KeyboardAvoidingView",
      Platform: { OS: "android" },
      Keyboard: { dismiss: () => {} },
      BackHandler: {},
    },
    "@/components/app-bar": {
      AppBar: Object.assign("AppBar".toString, { TextButton: "TextButton" }),
    },
    "@/components/Button": { Button: "Button" },
    "@/components/Field": { HelperText: "HelperText" },
    "@/components/Loading": { Spinner: "Spinner" },
    "@/components/LoadingDialog": { LoadingDialog: "LoadingDialog" },
    "@/components/modal": { ActionModal: "ActionModal", LoginRequiredModal: "LoginRequiredModal" },
    "@/contexts/AuthContext": {
      useAuth: () => ({ session: { user: { id: "viewer" } }, isRestoring: false }),
    },
    "@/contexts/PostDraftContext": {
      usePostDraft: () => ({
        items,
        setItems: (value) => {
          items = value;
        },
        reset: () => {
          items = [];
        },
      }),
    },
    "@/hooks/useToast": { useToast: () => (message) => toasts.push(message) },
    "@/constants/messages": { DIGGLE_TOAST_MESSAGES: { VOTE_009: "투표 등록 완료" } },
    "./api/community": { communityKeys: { all: ["community"] } },
    "./api/communityWrite": api,
    "./components/CommunityBodyField": { CommunityBodyField: "CommunityBodyField" },
    "./components/CommunityPolicySheet": { CommunityPolicySheet: "CommunityPolicySheet" },
    "./components/ProductAttachGrid": {
      MAX_ATTACH_COUNT: 4,
      ProductAttachGrid: "ProductAttachGrid",
    },
    "./domain/postBody": body,
  });
  const render = () => {
    index = 0;
    effects.length = 0;
    const outer = PostWriteScreen({ type: isVote ? "vote" : "all" });
    const tree = outer.type(outer.props);
    return tree;
  };
  const bar = (tree) => React.Children.toArray(tree.props.children)[0];
  return {
    render,
    calls,
    toasts,
    invalidations,
    input: (value) => nodes(render(), "CommunityBodyField")[0].props.onChangeText(value),
    submit: () => bar(render()).props.right.props.onPress(),
    blockBack: () => prevented?.(),
    runEffects: () => effects.map((effect) => effect()),
    destination: () => destination,
  };
}

test("일반글 최초 동의 전에는 편집기를 숨기고 저장 실패 시 동의 시트를 유지한다", async () => {
  const ui = editor({
    agreed: false,
    agree: async () => {
      throw new Error("offline");
    },
  });
  let tree = ui.render();
  assert.equal(nodes(tree, "CommunityBodyField").length, 0);
  assert.equal(nodes(tree, "CommunityPolicySheet")[0].props.visible, true);
  await nodes(tree, "CommunityPolicySheet")[0].props.onConfirm();
  await settle();
  tree = ui.render();
  assert.equal(nodes(tree, "CommunityBodyField").length, 0);
  assert.match(nodes(tree, "CommunityPolicySheet")[0].props.error, /다시 시도/);
});

test("동의 성공 후 편집기를 열고 투표는 최초 일반글 동의 절차를 요구하지 않는다", async () => {
  const ui = editor({ agreed: false });
  nodes(ui.render(), "CommunityPolicySheet")[0].props.onConfirm();
  await settle();
  assert.equal(nodes(ui.render(), "CommunityBodyField").length, 1);
  assert.equal(
    nodes(editor({ agreed: false, isVote: true }).render(), "CommunityBodyField").length,
    1,
  );
});

test("연속 등록은 한 번만 요청하고 실패 재시도는 입력과 재시도 키를 유지한다", async () => {
  let reject;
  const ui = editor({
    save: () =>
      new Promise((_resolve, rejectSave) => {
        reject = rejectSave;
      }),
  });
  ui.input("작성하는 본문");
  ui.submit();
  ui.submit();
  assert.equal(ui.calls.length, 1);
  assert.equal(nodes(ui.render(), "LoadingDialog").length, 1);
  reject(new Error("offline"));
  await settle();
  assert.equal(nodes(ui.render(), "CommunityBodyField")[0].props.value, "작성하는 본문");
  ui.submit();
  assert.equal(ui.calls[1].requestId, ui.calls[0].requestId);
  reject(new Error("offline"));
  await settle();
  ui.input("수정한 다른 본문");
  ui.submit();
  assert.notEqual(ui.calls[2].requestId, ui.calls[1].requestId);
  reject(new Error("offline"));
  await settle();
});

test("등록 성공 시 서버 목록을 갱신하고 투표 탭으로 복귀한다", async () => {
  const ui = editor({ isVote: true });
  ui.input("정상 투표 본문");
  ui.submit();
  await settle();
  ui.render();
  ui.runEffects();
  assert.equal(ui.invalidations.length, 1);
  assert.equal(ui.destination().pathname, "/(tabs)/diggle");
  assert.equal(ui.destination().params.tab, "vote");
});

test("등록 성공 후 화면 이동이 끝나기 전에는 첨부 초안을 비우지 않는다", async () => {
  for (const isVote of [false, true]) {
    const ui = editor({ isVote });
    ui.render();
    const cleanups = ui.runEffects().filter((cleanup) => typeof cleanup === "function");
    ui.input("등록할 정상 본문");
    ui.submit();
    await settle();
    const tree = ui.render();
    assert.equal(nodes(tree, "CommunityBodyField")[0].props.value, "등록할 정상 본문");
    assert.equal(nodes(tree, "ProductAttachGrid")[0].props.items.length, 1);
    assert.equal(React.Children.toArray(tree.props.children)[0].props.right.props.disabled, true);
    ui.submit();
    await settle();
    assert.equal(ui.calls.length, 1, "복귀 중 등록을 다시 눌러도 중복 저장하지 않는다");
    ui.runEffects();
    assert.equal(ui.destination().pathname, "/(tabs)/diggle");
    cleanups.forEach((cleanup) => cleanup());
    assert.equal(nodes(ui.render(), "ProductAttachGrid")[0].props.items.length, 0);
  }
});

test("작성 이탈 취소는 초안을 유지하고 나가기는 초안을 폐기해 DIGGLE로 복귀한다", () => {
  const ui = editor();
  ui.input("작성하는 본문");
  ui.render();
  ui.blockBack();
  let modal = nodes(ui.render(), "ActionModal")[0];
  assert.equal(modal.props.visible, true);
  modal.props.secondaryAction.onPress();
  assert.equal(nodes(ui.render(), "CommunityBodyField")[0].props.value, "작성하는 본문");
  ui.blockBack();
  modal = nodes(ui.render(), "ActionModal")[0];
  modal.props.primaryAction.onPress();
  const tree = ui.render();
  ui.runEffects();
  assert.equal(nodes(tree, "ProductAttachGrid")[0].props.items.length, 0);
  assert.equal(ui.destination().pathname, "/(tabs)/diggle");
});

test("본문 입력 안내는 카운터로만 글자 수를 보여 주고 이모지 언급을 하지 않는다(BUG-093)", () => {
  const ui = editor({ agreed: true });
  ui.input("가나");
  const helper = nodes(ui.render(), "HelperText")[0];
  assert.equal(helper.props.message, "공백을 제외하고 5자 이상 입력해 주세요.");
  const { CommunityBodyField } = load("src/screens/diggle/components/CommunityBodyField.tsx", {
    "react": { useState: () => [false, () => {}] },
    "react-native": { View: "View", Text: "Text", TextInput: "TextInput" },
    "@/theme": { colors: { gray: { 400: "gray" } } },
    "../domain/postBody": body,
  });
  for (const isVote of [false, true]) {
    const field = CommunityBodyField({ value: "", onChangeText: () => {}, isVote });
    assert.doesNotMatch(nodes(field, "TextInput")[0].props.placeholder, /5~50자/);
  }
});
