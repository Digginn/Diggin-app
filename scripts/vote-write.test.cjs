/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function load(filename, mocks) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(path.join(__dirname, filename), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    __DEV__: true,
    module,
    exports: module.exports,
    setTimeout: mocks.setTimeout,
    clearTimeout: () => {},
    setInterval: mocks.setInterval,
    clearInterval: mocks.clearInterval ?? (() => {}),
    Date: mocks.Date ?? Date,
    require: (name) => mocks[name] ?? require(name),
  });
  return module.exports;
}

function findAll(node, type) {
  if (!React.isValidElement(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap((child) => findAll(child, type)),
  ];
}

// Remote detail access and comment display are covered by community.test.cjs.

test("댓글 30자 초과는 오류를 표시하고 줄이면 전송 가능한 상태로 복귀한다", () => {
  const { CommentInput } = load("../src/components/CommentInput.tsx", {
    "react": { forwardRef: (render) => render },
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable", TextInput: "TextInput" },
    "@/assets/images/icon-send.svg": { __esModule: true, default: "SendSvg" },
    "@/theme": {
      colors: { gray: { 400: "gray", 900: "black" } },
      typography: { "label-16-medium": { size: 16 } },
    },
  });
  const longValue = "a".repeat(30) + "\n";
  let changed;
  const render = (value) =>
    CommentInput(
      {
        value,
        onChangeText: (next) => {
          changed = next;
        },
        onSend() {},
      },
      null,
    );
  const tooLong = render(longValue);
  assert.equal(findAll(tooLong, "Text")[0].props.children, "댓글은 30자 이하로 입력해 주세요.");
  assert.ok(
    findAll(tooLong, "View").some((view) => view.props.className.includes("border-semantic-error")),
  );
  assert.equal(findAll(tooLong, "Pressable")[0].props.disabled, true);
  const field = findAll(tooLong, "TextInput")[0];
  assert.equal(field.props.value, longValue);
  assert.equal(field.props.maxLength, undefined, "입력을 잘라내지 않는다");
  field.props.onChangeText("a".repeat(29) + "\n");
  const recovered = render(changed);
  assert.equal(findAll(recovered, "Text").length, 0);
  assert.equal(findAll(recovered, "Pressable")[0].props.disabled, false);
  assert.equal(findAll(render(" \n "), "Pressable")[0].props.disabled, true);
});

test("투표 아이템은 하나만 선택하며 다른 아이템을 누르면 교체한다", () => {
  for (const { type, os } of [
    { type: "vote", os: "ios" },
    { type: "vote", os: "android" },
    { type: "all", os: "ios" },
    { type: "all", os: "android" },
  ]) {
    const state = [];
    let index = 0;
    let attached;
    const keyboardEvents = {};
    let backCount = 0;
    const { ItemSelectScreen } = load("../src/screens/diggle/ItemSelectScreen.tsx", {
      "react": {
        useEffect: (effect) => effect(),
        useState: (initial) => {
          const slot = index++;
          if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
          return [
            state[slot],
            (next) => {
              state[slot] = typeof next === "function" ? next(state[slot]) : next;
            },
          ];
        },
      },
      "react-native": {
        View: "View",
        Text: "Text",
        FlatList: "FlatList",
        KeyboardAvoidingView: "KeyboardAvoidingView",
        Platform: { OS: os },
        Keyboard: {
          isVisible: () => false,
          dismiss: () => {},
          addListener: (name, callback) => {
            keyboardEvents[name] = callback;
            return { remove: () => {} };
          },
        },
      },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 34 }) },
      "expo-router": {
        useLocalSearchParams: () => ({ type }),
        useRouter: () => ({
          back: () => {
            backCount += 1;
          },
        }),
      },
      "@/components/app-bar": { AppBar: "AppBar" },
      "@/components/Loading": { Spinner: "Spinner" },
      "@/contexts/AuthContext": { useAuth: () => ({ session: { user: { id: "viewer" } } }) },
      "@/hooks/useProductCounts": { useProductCounts: () => ({ data: { total: 9 } }) },
      "@/hooks/useProductList": {
        useProductList: (_sort, _level, query) => ({
          data: {
            pages: [
              Array.from({ length: query === "partial" ? 2 : query ? 3 : 9 }, (_, i) => ({
                id: String(i),
                name: ["미니 토트백", "캔버스 숄더 가방", "레더 크로스백"][i] ?? `아이템 ${i}`,
                price: null,
                brand: "브랜드",
              })),
            ],
          },
        }),
      },
      "@/components/Button": { Button: "Button" },
      "@/components/Field": { HelperText: "HelperText", SearchField: "SearchField" },
      "@/contexts/PostDraftContext": {
        usePostDraft: () => ({
          items: [],
          setItems: (items) => {
            attached = items;
          },
        }),
      },
      "./components/ProductAttachGrid": { MAX_ATTACH_COUNT: 4 },
      "./components/SelectCard": { SelectCard: "SelectCard" },
    });
    const render = () => {
      index = 0;
      return ItemSelectScreen();
    };
    const select = (id) => {
      const list = findAll(render(), "FlatList")[0];
      list.props.renderItem({ item: list.props.data[id] }).props.onToggle();
    };
    assert.equal(render().props.behavior, os === "ios" ? "padding" : "height");
    assert.equal(render().props.style.flex, 1);
    assert.ok(!render().props.className.includes("flex-1"));
    assert.equal(findAll(render(), "Button")[0].props.isDisabled, true);
    select(0);
    select(1);
    assert.equal(state[1].length, type === "vote" ? 1 : 2);
    assert.equal(state[1].at(-1).id, "1");
    findAll(render(), "Button")[0].props.onPress();
    assert.equal(attached.length, type === "vote" ? 1 : 2);
    assert.equal(backCount, 1);
    select(1);
    if (type === "vote") assert.equal(findAll(render(), "Button")[0].props.isDisabled, true);
    select(2);
    select(3);
    select(4);
    select(5);
    assert.equal(state[1].length, type === "vote" ? 1 : 4);
    assert.equal(
      findAll(render(), "SearchField")[0].props.placeholder,
      "아이템명, 브랜드명으로 검색",
    );
    if (type === "vote") {
      findAll(render(), "SearchField")[0].props.onChangeText("가방");
      assert.equal(findAll(render(), "FlatList")[0].props.data.length, 3);
      assert.equal(state[1][0].id, "5");
      findAll(render(), "Button")[0].props.onPress();
      assert.equal(attached[0].id, "5", "검색 결과에 없어도 선택한 상품을 첨부한다");
      select(0);
      assert.equal(state[1][0].id, "0");
      keyboardEvents[os === "ios" ? "keyboardWillShow" : "keyboardDidShow"]();
      assert.equal(findAll(render(), "View").at(-1).props.style.paddingBottom, 12);
      keyboardEvents[os === "ios" ? "keyboardWillHide" : "keyboardDidHide"]();
      assert.equal(findAll(render(), "View").at(-1).props.style.paddingBottom, 34);
      findAll(render(), "Button")[0].props.onPress();
      assert.equal(attached[0].name, "미니 토트백");
    }
    findAll(render(), "SearchField")[0].props.onChangeText("partial");
    const partial = findAll(render(), "FlatList")[0];
    assert.equal(partial.props.data.length, 3);
    assert.equal(partial.props.data[2], null, "결과가 2개여도 빈 셀로 세 열 너비 유지");
    assert.equal(partial.props.renderItem({ item: null }).props.className, "flex-1");
  }
});

test("투표 첨부 영역은 160 높이의 한 열이며 첨부하면 추가 버튼을 숨긴다", () => {
  const { ProductAttachGrid } = load("../src/screens/diggle/components/ProductAttachGrid.tsx", {
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable" },
    "@/assets/images/icon-plus.svg": { __esModule: true, default: "PlusSvg" },
    "@/components/ProductImg": { ProductImg: "ProductImg" },
    "@/theme": { colors: { gray: { 900: "#1E1E1E" } } },
  });
  let presses = 0;
  const props = {
    items: [],
    maxCount: 1,
    onPressAdd: () => {
      presses += 1;
    },
  };
  const button = findAll(ProductAttachGrid(props), "Pressable")[0];
  assert.ok(button.props.className.includes("h-40"));
  button.props.onPress();
  assert.equal(presses, 1);
  const filled = ProductAttachGrid({ ...props, items: [{ id: "1" }] });
  assert.equal(findAll(filled, "Pressable").length, 0);
  assert.equal(findAll(filled, "ProductImg").length, 1);
  assert.ok(
    findAll(ProductAttachGrid({ ...props, maxCount: 4 }), "Pressable")[0].props.className.includes(
      "aspect-square",
    ),
  );
});

// 실제 등록·실패 재시도는 community-write.test.cjs에서 검증한다.

test("투표 결과는 비례 너비, 동률, 0명 및 종료 상태를 표시한다", () => {
  const { VoteBlock } = load("../src/screens/diggle/components/VoteBlock.tsx", {
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable" },
  });
  let selected;
  const vote = {
    buyCount: 12,
    notCount: 5,
    myChoice: null,
    isClosed: false,
    remainingLabel: "23시간 12분 남음",
  };
  const props = {
    vote,
    onChoose: (choice) => {
      selected = choice;
    },
  };
  const before = VoteBlock(props);
  assert.equal(findAll(before, "Pressable").length, 2);
  findAll(before, "Pressable")[0].props.onPress();
  assert.equal(selected, "BUY");
  const results = VoteBlock({ ...props, vote: { ...vote, myChoice: "BUY" } });
  assert.equal(
    findAll(results, "View").find((view) => view.props.style)?.props.style.width,
    `${(12 / 17) * 100}%`,
  );
  assert.equal(findAll(results, "Pressable")[0].props.accessibilityState.selected, true);
  assert.equal(findAll(results, "Pressable")[0].props.disabled, true);
  assert.equal(findAll(results, "Pressable")[1].props.disabled, false);
  const ownVote = VoteBlock({ ...props, isMyVote: true });
  assert.equal(findAll(ownVote, "Pressable")[0].props.accessibilityLabel, "BUY 12명");
  assert.ok(!findAll(ownVote, "Text").some((text) => text.props.children === "✓ 내 선택"));
  assert.ok(
    !findAll(ownVote, "Text").some((text) =>
      String(text.props.children).includes("투표할 수 있어요"),
    ),
  );
  const tie = VoteBlock({ ...props, vote: { ...vote, buyCount: 5, myChoice: "BUY" } });
  assert.equal(
    findAll(tie, "View").filter((view) => view.props.className?.includes("bg-gray-900")).length,
    0,
  );
  const closed = VoteBlock({ ...props, vote: { ...vote, isClosed: true } });
  assert.ok(findAll(closed, "Pressable").every((button) => button.props.disabled));
  const empty = VoteBlock({
    ...props,
    vote: { ...vote, buyCount: 0, notCount: 0, isClosed: true },
  });
  assert.ok(
    findAll(empty, "View")
      .filter((view) => view.props.style)
      .every((view) => view.props.style.width === "0%"),
  );
});

test("UI용 투표 등록·재선택은 투표 목록만 갱신하며 종료 후 변경되지 않는다", () => {
  let index = 0;
  const state = [];
  const mockPost = { id: "1", items: [{ id: "item-1" }], authorId: "me" };
  const { PostsProvider } = load("../src/contexts/PostsContext.tsx", {
    "react": {
      createContext: () => ({ Provider: "Provider" }),
      useState: (initial) => {
        const slot = index++;
        if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
        return [
          state[slot],
          (next) => {
            state[slot] = typeof next === "function" ? next(state[slot]) : next;
          },
        ];
      },
      useCallback: (callback) => callback,
      useMemo: (factory) => factory(),
      useEffect: () => {},
    },
    "react-native": { AppState: {} },
    "@/screens/diggle/utils/voteTiming": load("../src/screens/diggle/utils/voteTiming.ts", {}),
    "@/screens/diggle/constants/mockPosts": { CURRENT_USER_ID: "me", MOCK_POSTS: [mockPost] },
  });
  const render = () => {
    index = 0;
    return PostsProvider({ children: null }).props.value;
  };
  render().addVotePreview("새 투표 본문", [{ id: "new-item" }]);
  const id = render().votes[0].id;
  assert.equal(render().votes[0].body, "새 투표 본문");
  assert.equal(render().posts.length, 1);
  render().chooseVote(id, "BUY");
  assert.equal(render().votes[0].buyCount, 0);
  assert.equal(render().votes[0].myChoice, null);
  state[1][0] = { ...state[1][0], authorId: "other-user" };
  render().chooseVote(id, "BUY");
  assert.equal(render().votes[0].buyCount, 1);
  render().chooseVote(id, "BUY");
  assert.equal(render().votes[0].buyCount, 1);
  render().chooseVote(id, "NOT");
  assert.equal(render().votes[0].buyCount, 0);
  assert.equal(render().votes[0].notCount, 1);
  state[1][0] = { ...state[1][0], isClosed: true };
  render().chooseVote(id, "BUY");
  assert.equal(render().votes[0].myChoice, "NOT");
  render().deleteVote(id);
  assert.ok(!render().votes.some((vote) => vote.id === id));
  assert.equal(render().posts.length, 1);
});

test("투표는 등록 후 정확히 24시간에 종료되며 남은 시간을 계산한다", () => {
  const { getVoteTiming, VOTE_DURATION_MS } = load("../src/screens/diggle/utils/voteTiming.ts", {});
  const createdAt = 1000000;
  assert.equal(getVoteTiming(createdAt, createdAt).remainingLabel, "24시간 남음");
  assert.equal(getVoteTiming(createdAt, createdAt + 48 * 60000).remainingLabel, "23시간 12분 남음");
  assert.equal(getVoteTiming(createdAt, createdAt + VOTE_DURATION_MS - 1).isClosed, false);
  assert.equal(
    getVoteTiming(createdAt, createdAt + VOTE_DURATION_MS - 1).remainingLabel,
    "1분 남음",
  );
  assert.equal(getVoteTiming(createdAt, createdAt + VOTE_DURATION_MS).isClosed, true);
  assert.equal(getVoteTiming(createdAt, createdAt + 2 * VOTE_DURATION_MS).isClosed, true);
});

test("시간 경과·앱 복귀 시 종료를 갱신하고 갱신 전에도 만료된 투표를 막는다", () => {
  let now = 1000000;
  let index = 0;
  const state = [];
  let tick;
  let onAppState;
  let cleanup;
  let removed = false;
  let cleared = false;
  const timing = load("../src/screens/diggle/utils/voteTiming.ts", { Date: { now: () => now } });
  const { PostsProvider } = load("../src/contexts/PostsContext.tsx", {
    "Date": { now: () => now },
    "setInterval": (callback) => {
      tick = callback;
      return 1;
    },
    "clearInterval": () => {
      cleared = true;
    },
    "react": {
      createContext: () => ({ Provider: "Provider" }),
      useState: (initial) => {
        const slot = index++;
        if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
        return [
          state[slot],
          (next) => {
            state[slot] = typeof next === "function" ? next(state[slot]) : next;
          },
        ];
      },
      useCallback: (callback) => callback,
      useMemo: (factory) => factory(),
      useEffect: (effect) => {
        if (!cleanup) cleanup = effect();
      },
    },
    "react-native": {
      AppState: {
        addEventListener: (_, callback) => {
          onAppState = callback;
          return {
            remove: () => {
              removed = true;
            },
          };
        },
      },
    },
    "@/screens/diggle/utils/voteTiming": timing,
    "@/screens/diggle/constants/mockPosts": {
      CURRENT_USER_ID: "me",
      MOCK_POSTS: Array.from({ length: 4 }, (_, i) => ({
        id: String(i),
        authorId: "other",
        items: [],
      })),
    },
  });
  const render = () => {
    index = 0;
    return PostsProvider({ children: null }).props.value;
  };
  assert.deepEqual(
    Array.from(render().votes, (vote) => vote.isClosed),
    [false, false, true, true],
  );
  render().addVotePreview("new vote", []);
  const id = render().votes[0].id;
  state[1][0] = { ...state[1][0], authorId: "other" };
  now += timing.VOTE_DURATION_MS;
  render().chooseVote(id, "BUY");
  assert.equal(render().votes[0].myChoice, null);
  tick();
  assert.equal(render().votes[0].isClosed, true);
  now -= timing.VOTE_DURATION_MS;
  tick();
  assert.equal(render().votes[0].isClosed, true);
  now += 1;
  render().addVotePreview("return test", []);
  now += timing.VOTE_DURATION_MS;
  onAppState("active");
  assert.equal(render().votes[0].isClosed, true);
  cleanup();
  assert.equal(removed && cleared, true);
});
