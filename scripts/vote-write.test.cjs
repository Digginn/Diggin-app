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

test("게시글·투표 상세는 iOS padding과 Android height로 댓글 입력창을 회피한다", () => {
  for (const os of ["ios", "android"]) {
    for (const type of ["all", "vote"]) {
      const state = [];
      let stateIndex = 0;
      const post = {
        id: "1",
        authorId: "other-user",
        body: "본문",
        items: [{ id: "item-1" }],
        buyCount: 12,
        notCount: 5,
        myChoice: null,
        isClosed: false,
        createdAt: Date.now(),
      };
      const { PostDetailScreen } = load("../src/screens/diggle/PostDetailScreen.tsx", {
        "react": {
          useState: (initial) => {
            const slot = stateIndex++;
            if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
            return [
              state[slot],
              (next) => {
                state[slot] = typeof next === "function" ? next(state[slot]) : next;
              },
            ];
          },
          useRef: (initial) => ({ current: initial }),
        },
        "expo-blur": { BlurTargetView: "BlurTargetView" },
        "react-native": {
          KeyboardAvoidingView: "KeyboardAvoidingView",
          Platform: { OS: os },
          Pressable: "Pressable",
          ScrollView: "ScrollView",
          Text: "Text",
          View: "View",
          Keyboard: { dismiss: () => {} },
        },
        "expo-router": { useRouter: () => ({}), useLocalSearchParams: () => ({ id: "1" }) },
        "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 34 }) },
        "@/assets/images/icon-kebab.svg": { __esModule: true, default: "KebabSvg" },
        "@/assets/images/icon-report.svg": { __esModule: true, default: "ReportSvg" },
        "@/components/app-bar": { AppBar: "AppBar" },
        "@/components/Comment": { Comment: "Comment" },
        "@/components/CommentEditBanner": { CommentEditBanner: "CommentEditBanner" },
        "@/components/CommentInput": { COMMENT_MAX_LENGTH: 30, CommentInput: "CommentInput" },
        "@/components/EmptyState": { EmptyState: "EmptyState" },
        "@/components/FloatingToolbar": { FloatingToolbar: "FloatingToolbar" },
        "@/components/modal": { ActionModal: "ActionModal" },
        "@/components/ProductImg": { ProductImg: "ProductImg" },
        "@/components/ReportFlow": { ReportFlow: "ReportFlow" },
        "@/constants/messages": { DIGGLE_TOAST_MESSAGES: {} },
        "@/contexts/BlockedUsersContext": { useBlockedUsers: () => ({ isBlocked: () => false }) },
        "@/contexts/PostsContext": {
          usePosts: () => ({
            findPost: () => post,
            votes: [post],
            chooseVote: (_, choice) => {
              post.myChoice = choice;
            },
          }),
        },
        "@/hooks/useToast": { useToast: () => () => {} },
        "@/screens/item-detail/components/FolderManageSheet": {
          FolderManageSheet: "FolderManageSheet",
        },
        "@/theme": { colors: { gray: { 900: "#1E1E1E", 400: "#B9B9B9" } } },
        "./components/LikeCommentRow": { LikeCommentRow: "LikeCommentRow" },
        "./components/PostItemInfoSheet": { PostItemInfoSheet: "PostItemInfoSheet" },
        "./components/ProductImgGrid": { ProductImgGrid: "ProductImgGrid" },
        "./components/SaveToAllSheet": { SaveToAllSheet: "SaveToAllSheet" },
        "./components/VoteBlock": { VoteBlock: "VoteBlock" },
        "./components/VoteReasonScreen": { VoteReasonScreen: "VoteReasonScreen" },
        "./utils/voteTiming": load("../src/screens/diggle/utils/voteTiming.ts", {}),
        "./constants/mockPosts": {
          CURRENT_USER_ID: "me",
          DEFAULT_FOLDER_ID: "default",
          MOCK_FOLDERS: [],
          findMockComments: () => [],
          findMockVoteComments: () => [
            { id: "author", authorId: "other-user", author: "글쓴이", body: "작성자 댓글" },
            { id: "buy", authorId: "anon-1", author: "디기 1", body: "BUY 의견", vote: "buy" },
            { id: "not", authorId: "anon-2", author: "디기 2", body: "NOT 의견", vote: "not" },
          ],
          MOCK_POSTS: [post],
        },
      });
      const render = () => {
        stateIndex = 0;
        return PostDetailScreen({ type });
      };
      const screen = findAll(render(), "KeyboardAvoidingView")[0];
      assert.equal(screen.type, "KeyboardAvoidingView");
      assert.equal(screen.props.behavior, os === "ios" ? "padding" : "height");
      assert.equal(screen.props.style.flex, 1);
      assert.ok(!screen.props.className.includes("flex-1"));
      assert.equal(findAll(screen, "CommentInput").length, 1);
      assert.equal(findAll(screen, "ScrollView")[0].props.keyboardShouldPersistTaps, "handled");
      assert.equal(
        findAll(screen, "View").filter((view) => view.props.className === "h-3 w-full bg-gray-100")
          .length,
        1,
      );
      if (type === "vote") {
        findAll(render(), "VoteBlock")[0].props.onChoose("BUY");
        assert.equal(findAll(render(), "VoteReasonScreen")[0].props.choice, "BUY");
        findAll(render(), "VoteReasonScreen")[0].props.onClose();
        assert.equal(findAll(render(), "VoteReasonScreen").length, 0);
        assert.equal(post.myChoice, null, "X는 투표 선택을 확정하지 않는다");
        assert.equal(findAll(render(), "Comment").length, 3);
        findAll(render(), "VoteBlock")[0].props.onChoose("NOT");
        findAll(render(), "VoteReasonScreen")[0].props.onSubmit("좋은 선택");
        assert.equal(findAll(render(), "Comment").at(-1).props.body, "좋은 선택");
        assert.equal(findAll(render(), "Comment").at(-1).props.vote, "not");
        assert.equal(findAll(render(), "Comment").at(-1).props.author, "디기 3 (나)");
        assert.equal(findAll(render(), "VoteReasonScreen").length, 0);
        assert.equal(post.myChoice, "NOT");
        findAll(render(), "VoteBlock")[0].props.onChoose("BUY");
        findAll(render(), "VoteReasonScreen")[0].props.onClose();
        assert.equal(post.myChoice, "NOT");
        findAll(render(), "VoteBlock")[0].props.onChoose("NOT");
        assert.equal(findAll(render(), "VoteReasonScreen").length, 0);
        findAll(render(), "VoteBlock")[0].props.onChoose("BUY");
        findAll(render(), "VoteReasonScreen")[0].props.onSkip();
        assert.equal(post.myChoice, "BUY");
        assert.equal(findAll(render(), "Comment").length, 4);
      }
    }
  }
});

test("이유 입력은 BUY/NOT 칩, 30자 제한, 빈 의견 차단과 키보드 높이를 적용한다", () => {
  for (const os of ["ios", "android"]) {
    const state = [];
    let index = 0;
    let submitted;
    let closed = 0;
    const events = {};
    const { VoteReasonScreen } = load("../src/screens/diggle/components/VoteReasonScreen.tsx", {
      "react": {
        useState: (initial) => {
          const slot = index++;
          if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
          return [
            state[slot],
            (next) => {
              state[slot] = next;
            },
          ];
        },
        useEffect: (effect) => effect(),
      },
      "expo-blur": { BlurView: "BlurView" },
      "react-native": {
        View: "View",
        Text: "Text",
        TextInput: "TextInput",
        ScrollView: "ScrollView",
        Pressable: "Pressable",
        KeyboardAvoidingView: "KeyboardAvoidingView",
        Platform: { OS: os },
        Keyboard: {
          isVisible: () => false,
          addListener: (name, callback) => {
            events[name] = callback;
            return { remove: () => {} };
          },
        },
        BackHandler: {
          addEventListener: (_, callback) => {
            events.back = callback;
            return { remove: () => {} };
          },
        },
      },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 50, bottom: 34 }) },
      "@/assets/images/icon-vote-reason-close.svg": { __esModule: true, default: "CloseSvg" },
      "@/components/Button": { Button: "Button" },
      "@/components/CommentInput": { COMMENT_MAX_LENGTH: 30 },
      "@/theme": {
        colors: { gray: { 400: "#B9B9B9" } },
        typography: { b2: { size: 15, ratio: 1.4 } },
      },
    });
    const render = (choice = "BUY") => {
      index = 0;
      return VoteReasonScreen({
        choice,
        blurTarget: { current: null },
        onClose: () => {
          closed += 1;
        },
        onSkip: () => {
          closed += 1;
        },
        onSubmit: (body) => {
          submitted = body;
        },
      });
    };
    const field = () =>
      findAll(render(), "View").find((view) => view.props.className?.includes("rounded-xl"));
    assert.equal(findAll(render(), "Button")[0].props.isDisabled, true);
    assert.ok(field().props.className.includes("h-32"));
    assert.equal(
      findAll(render(), "KeyboardAvoidingView")[0].props.behavior,
      os === "ios" ? "padding" : "height",
    );
    findAll(render(), "TextInput")[0].props.onChangeText("  \n ");
    assert.equal(findAll(render(), "Button")[0].props.isDisabled, true);
    findAll(render(), "TextInput")[0].props.onChangeText("😀".repeat(31));
    assert.equal(
      Array.from(
        require("unicode-segmenter/grapheme").splitGraphemes(
          findAll(render(), "TextInput")[0].props.value,
        ),
      ).length,
      30,
    );
    findAll(render(), "Button")[0].props.onPress();
    assert.equal(submitted, "😀".repeat(30));
    events[os === "ios" ? "keyboardWillShow" : "keyboardDidShow"]();
    findAll(render(), "TextInput")[0].props.onFocus();
    assert.ok(field().props.className.includes("h-24"));
    assert.ok(field().props.className.includes("border-field"));
    events[os === "ios" ? "keyboardWillHide" : "keyboardDidHide"]();
    assert.ok(field().props.className.includes("h-32"));
    assert.ok(!field().props.className.includes("border-field"));
    findAll(render("NOT"), "Pressable").at(-1).props.onPress();
    assert.equal(closed, 1);
    assert.equal(events.back(), true);
    assert.equal(closed, 2);
  }
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
          if (!(slot in state)) state[slot] = initial;
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
    assert.equal(state[1].at(-1), "1");
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
      assert.equal(state[1][0], "5");
      select(0);
      assert.equal(state[1][0], "0");
      keyboardEvents[os === "ios" ? "keyboardWillShow" : "keyboardDidShow"]();
      assert.equal(findAll(render(), "View").at(-1).props.style.paddingBottom, 12);
      keyboardEvents[os === "ios" ? "keyboardWillHide" : "keyboardDidHide"]();
      assert.equal(findAll(render(), "View").at(-1).props.style.paddingBottom, 34);
      findAll(render(), "Button")[0].props.onPress();
      assert.equal(attached[0].name, "미니 토트백");
    }
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

test("투표 작성은 공용 입력 검증과 1개 첨부 조건으로 등록을 활성화한다", () => {
  for (const isValid of [false, true]) {
    for (const count of [0, 1, 2]) {
      let slot = 0;
      let destination;
      let isSubmitPreview = false;
      let completeRegistration;
      let addedVote;
      let toast;
      const { PostWriteScreen } = load("../src/screens/diggle/PostWriteScreen.tsx", {
        "react": {
          useState: (initial) => {
            const currentSlot = slot++;
            return [
              currentSlot === 1 ? isValid : currentSlot === 3 ? isSubmitPreview : initial,
              (next) => {
                if (currentSlot === 3) isSubmitPreview = next;
              },
            ];
          },
          useEffect: (effect) => effect(),
          useCallback: (callback) => callback,
        },
        "setTimeout": (callback) => {
          completeRegistration = callback;
        },
        "./constants/mockPosts": { CURRENT_USER_ID: "me" },
        "react-native": {
          View: "View",
          Text: "Text",
          Pressable: "Pressable",
          ScrollView: "ScrollView",
          KeyboardAvoidingView: "KeyboardAvoidingView",
          Platform: { OS: "ios" },
          Keyboard: { dismiss: () => {} },
        },
        "expo-router": {
          useFocusEffect: () => {},
          useRouter: () => ({
            push: (route) => {
              destination = route;
            },
            dismissTo: (route) => {
              destination = route;
            },
          }),
        },
        "@/components/app-bar": { AppBar: "AppBar" },
        "@/components/Field": { BodyTextField: "BodyTextField", HelperText: "HelperText" },
        "@/components/LoadingDialog": { LoadingDialog: "LoadingDialog" },
        "@/components/modal": { ActionModal: "ActionModal" },
        "@/contexts/PostDraftContext": {
          usePostDraft: () => ({
            items: Array.from({ length: count }, (_, id) => ({ id: String(id) })),
            reset: () => {},
          }),
        },
        "@/contexts/PostsContext": {
          usePosts: () => ({
            addVotePreview: (body, items) => {
              addedVote = { body, items };
            },
          }),
        },
        "@/constants/messages": {
          DIGGLE_TOAST_MESSAGES: {
            VOTE_009: "투표를 등록했습니다. 24시간 뒤 결과를 알려드립니다.",
          },
        },
        "@/hooks/useToast": {
          useToast: () => (message) => {
            toast = message;
          },
        },
        "./components/ProductAttachGrid": {
          MAX_ATTACH_COUNT: 4,
          ProductAttachGrid: "ProductAttachGrid",
        },
      });
      const tree = PostWriteScreen({ type: "vote" });
      const bar = findAll(tree, "AppBar")[0];
      assert.equal(bar.props.title, "투표글 작성");
      assert.equal(bar.props.right.props.disabled, !(isValid && count === 1));
      const input = findAll(tree, "BodyTextField")[0];
      assert.equal(input.props.size, "compact");
      assert.ok(input.props.placeholder.includes("최소 5글자"));
      const grid = findAll(tree, "ProductAttachGrid")[0];
      assert.equal(grid.props.maxCount, 1);
      grid.props.onPressAdd();
      assert.equal(destination, "/posts/item-select?type=vote");
      assert.ok(
        findAll(tree, "HelperText").some((helper) => helper.props.message.includes("24시간")),
      );
      if (isValid && count === 1) {
        bar.props.right.props.onPress();
        assert.equal(isSubmitPreview, true);
        slot = 0;
        const loading = PostWriteScreen({ type: "vote" });
        assert.equal(
          findAll(loading, "LoadingDialog")[0].props.message,
          "투표를 등록하는 중입니다.",
        );
        assert.equal(findAll(loading, "AppBar")[0].props.right.props.disabled, true);
        assert.equal(addedVote, undefined);
        completeRegistration();
        assert.equal(addedVote.items.length, 1);
        assert.equal(destination.pathname, "/(tabs)/diggle");
        assert.equal(destination.params.tab, "vote");
        assert.equal(toast, "투표를 등록했습니다. 24시간 뒤 결과를 알려드립니다.");
      }
    }
  }
});

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
