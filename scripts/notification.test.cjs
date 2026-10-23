/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

const LOGIN_SOURCES = {
  "@/lib/loginIntent": "../src/lib/loginIntent.ts",
  "@/hooks/useLoginGate": "../src/hooks/useLoginGate.tsx",
};

function load(filename, mocks, globals = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(path.join(__dirname, filename), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    ...globals,
    exports: loaded.exports,
    module: loaded,
    require: (name) =>
      mocks[name] ?? (LOGIN_SOURCES[name] ? load(LOGIN_SOURCES[name], mocks) : require(name)),
  });
  return loaded.exports;
}

function findAll(node, type) {
  if (!React.isValidElement(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap((child) => findAll(child, type)),
  ];
}

function member(Route) {
  const content = Route().props.children;
  return content.type(content.props);
}

test("상단 알림 버튼은 알림 화면으로 이동한다", () => {
  const events = [];
  const AppBar = Object.assign(() => null, {
    IconButton: "IconButton",
  });
  const mocks = {
    "react": {
      useState: (initial) => [initial, () => {}],
      useCallback: (callback) => callback,
      useLayoutEffect: () => {},
      useEffect: () => {},
    },
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable" },
    "expo-router": {
      useRouter: () => ({ push: (route) => events.push(route) }),
      useNavigation: () => ({}),
      useLocalSearchParams: () => ({}),
      useFocusEffect: () => {},
    },
    "@/contexts/AuthContext": { useAuth: () => ({ session: { user: { id: "u" } } }) },
    "@/assets/images/appbar": { IconNotification: "NotificationIcon", IconSearch: "SearchIcon" },
    "@/components/app-bar": { AppBar, SearchBar: "SearchBar" },
    "@/components/app-bar/NotificationButton": { NotificationButton: "NotificationButton" },
    "@/components/EmptyState": { EmptyState: "EmptyState" },
    "@/components/ErrorState": { ErrorState: "ErrorState" },
    "@/components/Loading": { LoadingDialog: "LoadingDialog" },
    "@/components/modal": { ActionModal: "ActionModal", LoginRequiredModal: "LoginRequiredModal" },
    "@/components/WishItemGrid": { WishItemGrid: "WishItemGrid" },
    "@/components/WishLevel": { WishLevel: "WishLevel" },
    "@/constants/messages": { STATE_MESSAGES: {} },
    "@/hooks/useToast": { useToast: () => () => {} },
    "@/hooks/useFirstVisitGuide": { useFirstVisitGuide: () => ({ isVisible: false }) },
    "@/components/FirstVisitGuide": { FirstVisitGuide: "FirstVisitGuide" },
    "./components/DeleteBar": { DeleteBar: "DeleteBar" },
    "./components/SelectModeBar": { SelectModeBar: "SelectModeBar" },
    "./components/SortLabel": { SortLabel: "SortLabel" },
    "@/screens/all/components/SortLabel": { SortLabel: "SortLabel" },
    "@/hooks/useProductList": { useProductList: () => ({ isPending: false, data: undefined }) },
    "@/hooks/useProductCounts": { useProductCounts: () => ({ data: undefined }) },
    "./mutations/useDeleteProducts": { useDeleteProducts: () => ({ mutate: () => {} }) },
    "./components/RecentSearches": { RecentSearches: "RecentSearches" },
    "./useRecentSearches": { useRecentSearches: () => ({ keywords: [] }) },
    "./constants": { MAX_SEARCH_LENGTH: 100 },
    "@/screens/folder/FolderScreen": { FolderScreen: "FolderScreen" },
    "@/hooks/useFolders": { useFolders: () => ({ data: [], isError: false }) },
    "@/hooks/useCreateFolder": { useCreateFolder: () => ({}) },
    "@/screens/folder/mutations/useDeleteFolder": { useDeleteFolder: () => ({}) },
    "@/screens/folder/mutations/useRenameFolder": { useRenameFolder: () => ({}) },
    "@/assets/images/folder/image-folder-item-preview.png": 1,
    "@/assets/images/folder/icon-folder-plus.svg": "PlusIcon",
    "@/assets/images/folder/image-fab-glow.svg": "FabGlow",
    "@/screens/save/components/ItemLinkSheet": { ItemLinkSheet: "ItemLinkSheet" },
    "@/components/ItemSaveFlow": { ItemSaveFlow: "ItemSaveFlow" },
    "@/hooks/useLinkDetectionPause": { useLinkDetectionPause: () => {} },
    "@/hooks/useItemSave": {
      useItemSave: () => ({
        values: null,
        hasFailed: false,
        isLoading: false,
        isBusy: false,
        start: () => {},
        openAfterLoading: () => {},
        close: () => {},
      }),
      EMPTY_ITEM_SAVE_VALUES: {},
    },
  };
  const { AllScreen } = load("../src/screens/all/AllScreen.tsx", mocks);
  const allBar = findAll(AllScreen(), AppBar)[0];
  findAll(allBar.props.right, "NotificationButton")[0].props.onPress();
  const { SearchScreen } = load("../src/screens/search/SearchScreen.tsx", mocks);
  assert.equal(findAll(SearchScreen(), "SearchBar")[0].props.maxLength, 100);
  findAll(SearchScreen(), "SearchBar")[0].props.right.props.onPress();
  const { default: FolderRoute } = load("../src/app/(tabs)/folder.tsx", mocks, {
    __DEV__: false,
  });
  findAll(FolderRoute(), "FolderScreen")[0].props.onNotifications();
  assert.deepEqual(events, ["/notifications", "/notifications", "/notifications"]);
});

test("비회원 FOLDER 탭은 남은 조회 오류가 있어도 오류 화면 대신 빈 나의 소장템을 보여 준다", () => {
  const { default: FolderRoute } = load(
    "../src/app/(tabs)/folder.tsx",
    {
      "react": { useState: (initial) => [initial, () => {}], useCallback: (callback) => callback },
      "expo-router": { useRouter: () => ({ push: () => {} }), useFocusEffect: () => {} },
      "@/contexts/AuthContext": { useAuth: () => ({ session: null }) },
      "@/components/modal": { LoginRequiredModal: "LoginRequiredModal" },
      "@/hooks/useFolders": { useFolders: () => ({ data: undefined, isError: true }) },
      "@/hooks/useProductCounts": { useProductCounts: () => ({ data: undefined }) },
      "@/hooks/useCreateFolder": { useCreateFolder: () => ({}) },
      "@/screens/folder/FolderScreen": { FolderScreen: "FolderScreen" },
      "@/screens/folder/mutations/useDeleteFolder": { useDeleteFolder: () => ({}) },
      "@/screens/folder/mutations/useRenameFolder": { useRenameFolder: () => ({}) },
    },
    { __DEV__: false },
  );
  const screen = findAll(FolderRoute(), "FolderScreen")[0];
  assert.equal(screen.props.isGuest, true);
  assert.equal(screen.props.isError, false);
  assert.equal(screen.props.folders, undefined);
});

test("알림 없음 화면은 공용 AppBar와 전체 화면 중앙 안내를 표시한다", () => {
  const { NotificationScreen } = load("../src/screens/notification/NotificationScreen.tsx", {
    "react": {
      useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
    },
    "react-native": { View: "View", Text: "Text", FlatList: "FlatList" },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "./components/NotificationRow": { NotificationRow: "NotificationRow" },
    "./components/NotificationSkeleton": { NotificationSkeleton: "NotificationSkeleton" },
    "./components/PushOffBanner": { PushOffBanner: "PushOffBanner" },
    "expo-status-bar": { StatusBar: "StatusBar" },
    "@/components/app-bar": { AppBar: "AppBar" },
    "@/components/Button": { Button: "Button" },
    "@/assets/images/image-empty-notification.svg": {
      __esModule: true,
      default: "EmptyNotification",
    },
  });
  let backCount = 0;
  const tree = NotificationScreen({
    onBack: () => {
      backCount += 1;
    },
  });
  const bar = findAll(tree, "AppBar")[0];
  assert.equal(bar.props.title, "알림");
  bar.props.onBack();
  assert.equal(backCount, 1);
  assert.equal(findAll(tree, "EmptyNotification").length, 1);
  assert.equal(findAll(tree, "Text")[0].props.children, "아직 표시할 내용이 없습니다.");
  assert.ok(
    findAll(tree, "View").some(
      (node) =>
        node.props.className === "absolute inset-0 items-center justify-center" &&
        node.props.pointerEvents === "none",
    ),
  );
  const svg = readFileSync(
    path.join(__dirname, "../assets/images/image-empty-notification.svg"),
    "utf8",
  );
  assert.match(svg, /width="96" height="96"/);
  const notification = {
    id: "test",
    title: "제목",
    message: "긴 본문",
    timeLabel: "방금 전",
    isRead: false,
  };
  let selected;
  const listTree = NotificationScreen({
    notifications: [notification],
    onPressNotification: (item) => {
      selected = item;
    },
  });
  const list = findAll(listTree, "FlatList")[0];
  assert.equal(list.props.keyExtractor(notification), "test");
  list.props.renderItem({ item: notification }).props.onPress();
  assert.equal(selected, notification);
  assert.equal(findAll(listTree, "EmptyNotification").length, 0);
  for (const notifications of [[], [notification]]) {
    const loading = NotificationScreen({ isLoading: true, notifications });
    assert.equal(findAll(loading, "NotificationSkeleton").length, 1);
    assert.equal(findAll(loading, "FlatList").length, 0);
    assert.equal(findAll(loading, "EmptyNotification").length, 0);
    assert.equal(findAll(loading, "AppBar").length, 1);
    let retries = 0;
    const errorTree = NotificationScreen({
      isError: true,
      notifications,
      onRetry: () => {
        retries += 1;
      },
    });
    assert.equal(findAll(errorTree, "FlatList").length, 0);
    assert.equal(findAll(errorTree, "EmptyNotification").length, 0);
    assert.equal(findAll(errorTree, "NotificationSkeleton").length, 0);
    assert.equal(findAll(errorTree, "Text")[0].props.children, "네트워크 연결을 확인해 주세요.");
    const retry = findAll(errorTree, "Button")[0];
    assert.equal(retry.props.children, "다시 시도");
    assert.equal(retry.props.isDisabled, false);
    retry.props.onPress();
    assert.equal(retries, 1);
  }
  assert.equal(findAll(NotificationScreen({ isError: true }), "Button")[0].props.isDisabled, true);
  let dismissedUntil;
  const renderBanner = (props = {}) =>
    findAll(
      NotificationScreen({
        notifications: [notification],
        isDevicePushEnabled: false,
        onDismissPushBanner: (until) => {
          dismissedUntil = until;
        },
        ...props,
      }),
      "FlatList",
    )[0].props.ListHeaderComponent;
  assert.equal(renderBanner().type, "PushOffBanner");
  assert.equal(renderBanner({ isDevicePushEnabled: true }), null);
  assert.equal(renderBanner({ bannerDismissedUntil: Date.now() + 1000 }), null);
  assert.equal(renderBanner({ bannerDismissedUntil: Date.now() - 1000 }).type, "PushOffBanner");
  const before = Date.now();
  renderBanner().props.onClose();
  assert.ok(dismissedUntil >= before + 7 * 24 * 60 * 60 * 1000);
  assert.ok(dismissedUntil <= Date.now() + 7 * 24 * 60 * 60 * 1000);
});

test("뒤로 가기는 이전 화면으로, 직접 진입한 경우에는 탭 화면으로 복귀한다", () => {
  for (const canGoBack of [true, false]) {
    const events = [];
    const { default: Route } = load(
      "../src/app/notifications.tsx",
      {
        "react-native": { Alert: { alert: () => {} }, Linking: { openSettings: async () => {} } },
        "expo-router": {
          useLocalSearchParams: () => ({}),
          useRouter: () => ({
            canGoBack: () => canGoBack,
            back: () => events.push("back"),
            replace: (route) => events.push(route),
          }),
        },
        "@/screens/notification/NotificationScreen": { NotificationScreen: "NotificationScreen" },
        "@/components/MemberOnly": { MemberOnly: "MemberOnly" },
        "@/screens/notification/hooks/useDevicePushOff": {
          useDevicePushOff: () => ({ isPushOff: false, dismissedUntil: 0, dismiss: () => {} }),
        },
        "@/screens/notification/queries/useNotifications": {
          useNotifications: () => ({ data: undefined, isPending: false, isError: false }),
        },
        "@/screens/notification/queries/useNotificationCheck": {
          useNotificationCheck: () => ({ data: null, isPending: false, isError: false }),
        },
        "@/screens/diggle/utils/formatCommunityTime": { formatCommunityTime: () => "방금 전" },
        "@/hooks/useToast": { useToast: () => () => {} },
        "@/constants/messages": {
          TOAST_MESSAGES: {
            NOTI_004: "삭제되었거나 더 이상 볼 수 없는 콘텐츠입니다.",
            VOTE_007: "삭제되었거나 더 이상 볼 수 없는 투표입니다.",
          },
        },
      },
      { __DEV__: false },
    );
    member(Route).props.onBack();
    assert.deepEqual(events, [canGoBack ? "back" : "/(tabs)/all"]);
  }
});

test("개발용 미리보기는 ?preview가 있을 때만 샘플을 보이고, 다시 시도하면 실제 목록으로 돌아가며 운영에는 샘플이 없다", () => {
  let preview = "error";
  const mocks = {
    "react-native": { Alert: { alert: () => {} }, Linking: { openSettings: async () => {} } },
    "expo-router": {
      useLocalSearchParams: () => ({ preview }),
      useRouter: () => ({
        setParams: (params) => {
          preview = params.preview;
        },
      }),
    },
    "@/screens/notification/NotificationScreen": { NotificationScreen: "NotificationScreen" },
    "@/components/MemberOnly": { MemberOnly: "MemberOnly" },
    "@/screens/notification/hooks/useDevicePushOff": {
      useDevicePushOff: () => ({ isPushOff: false, dismissedUntil: 0, dismiss: () => {} }),
    },
    "@/screens/notification/queries/useNotifications": {
      useNotifications: () => ({ data: undefined, isPending: false, isError: false }),
    },
    "@/screens/notification/queries/useNotificationCheck": {
      useNotificationCheck: () => ({ data: null, isPending: false, isError: false }),
    },
    "@/screens/diggle/utils/formatCommunityTime": { formatCommunityTime: () => "방금 전" },
    "@/hooks/useToast": { useToast: () => () => {} },
    "@/constants/messages": {
      TOAST_MESSAGES: { NOTI_004: "삭제되었거나 더 이상 볼 수 없는 콘텐츠입니다." },
    },
  };
  const { default: PreviewRoute } = load("../src/app/notifications.tsx", mocks, { __DEV__: true });
  assert.equal(member(PreviewRoute).props.isError, true);
  member(PreviewRoute).props.onRetry();
  assert.equal(member(PreviewRoute).props.isError, false);
  assert.equal(
    member(PreviewRoute).props.notifications.length,
    0,
    "미리보기를 끄면 실제 알림을 보여 준다",
  );
  preview = "push-off";
  assert.equal(member(PreviewRoute).props.notifications.length, 4);
  const { default: ProductionRoute } = load("../src/app/notifications.tsx", mocks, {
    __DEV__: false,
  });
  preview = "error";
  assert.equal(member(ProductionRoute).props.isError, false);
  assert.equal(
    typeof member(ProductionRoute).props.onRetry,
    "function",
    "운영의 다시 시도는 실제 목록을 다시 불러온다",
  );
  assert.equal(member(ProductionRoute).props.notifications.length, 0);
});

test("알림 행은 읽음 여부를 구분하며 긴 본문을 자르지 않고 선택 콜백을 호출한다", () => {
  const { NotificationRow } = load("../src/screens/notification/components/NotificationRow.tsx", {
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable" },
  });
  let presses = 0;
  for (const isRead of [true, false]) {
    const notification = {
      id: "test",
      title: "제목",
      message: "긴 본문".repeat(20),
      timeLabel: "방금 전",
      isRead,
    };
    const row = NotificationRow({
      notification,
      onPress: () => {
        presses += 1;
      },
    });
    assert.ok(row.props.className.includes(isRead ? "bg-gray-0" : "bg-gray-50"));
    const body = findAll(row, "Text")[2];
    assert.equal(body.props.children, notification.message);
    assert.equal(body.props.numberOfLines, undefined);
    row.props.onPress();
    assert.equal(NotificationRow({ notification }).props.disabled, true);
  }
  assert.equal(presses, 2);
});

test("알림 로딩은 4행 스켈레톤과 접근성 로딩 상태를 표시한다", () => {
  const { NotificationSkeleton } = load(
    "../src/screens/notification/components/NotificationSkeleton.tsx",
    {
      "react-native": { View: "View", ScrollView: "ScrollView" },
    },
  );
  const tree = NotificationSkeleton();
  assert.equal(tree.props.accessibilityState.busy, true);
  assert.equal(React.Children.toArray(tree.props.children).length, 4);
  assert.equal(
    findAll(tree, "View").filter((view) => view.props.className.includes("bg-gray-skeleton"))
      .length,
    16,
  );
});

test("기기 알림 배너는 공용 설정 버튼과 닫기 동작을 제공한다", () => {
  const { PushOffBanner } = load("../src/screens/notification/components/PushOffBanner.tsx", {
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable" },
    "@/components/Button": { Button: "Button" },
    "@/assets/images/icon-notification-banner-close.svg": {
      __esModule: true,
      default: "CloseIcon",
    },
  });
  const events = [];
  const tree = PushOffBanner({
    onClose: () => events.push("close"),
    onOpenSettings: () => events.push("settings"),
  });
  const button = findAll(tree, "Button")[0];
  assert.equal(button.props.children, "설정으로 이동");
  button.props.onPress();
  findAll(tree, "Pressable")[0].props.onPress();
  assert.deepEqual(events, ["settings", "close"]);
  assert.equal(findAll(tree, "CloseIcon").length, 1);
  const settingsBanner = PushOffBanner({
    title: "기기 알림이 꺼져 있습니다.",
    description: "알림을 받으려면 기기 설정에서 알림을 허용해 주세요.",
    onOpenSettings: () => events.push("settings"),
  });
  assert.equal(findAll(settingsBanner, "CloseIcon").length, 0);
  assert.equal(findAll(settingsBanner, "Pressable").length, 0);
  assert.equal(findAll(settingsBanner, "Text")[0].props.children, "기기 알림이 꺼져 있습니다.");
});

test("기기 알림이 꺼져 있으면 안내를 띄우고, 닫은 기한은 기기에 저장한다", async () => {
  const storage = { "push-off-banner-dismissed-until": null };
  let status = "denied";
  let onAppState;
  const state = [];
  let cursor = 0;
  let effect;
  const { useDevicePushOff } = load("../src/screens/notification/hooks/useDevicePushOff.ts", {
    "react": {
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => (state[index] = value)];
      },
      useEffect: (callback) => (effect = callback),
    },
    "react-native": {
      AppState: {
        addEventListener: (_event, handler) => {
          onAppState = handler;
          return { remove() {} };
        },
      },
    },
    "expo-notifications": { getPermissionsAsync: async () => ({ status }) },
    "@react-native-async-storage/async-storage": {
      __esModule: true,
      default: {
        getItem: async (key) => storage[key],
        setItem: async (key, value) => {
          storage[key] = value;
        },
      },
    },
  });
  const render = () => {
    cursor = 0;
    return useDevicePushOff();
  };
  assert.equal(render().isPushOff, false, "권한과 닫은 기한을 읽기 전에는 띄우지 않는다");
  effect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(render().isPushOff, true);

  render().dismiss(1234);
  assert.equal(storage["push-off-banner-dismissed-until"], "1234");
  assert.equal(render().dismissedUntil, 1234);

  // 설정에서 알림을 켜고 돌아오면 다시 확인한다.
  status = "granted";
  onAppState("active");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(render().isPushOff, false);

  status = "undetermined";
  onAppState("active");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(render().isPushOff, false, "아직 정하지 않은 권한은 꺼진 것으로 보지 않는다");
});

test("운영 알림 목록은 실제 알림과 지난 확인 뒤 새 알림을 보여 주고, 누르면 글 종류에 맞는 상세로 이동하거나 지워진 글을 안내하며 끝에서 다음 페이지를 부른다", () => {
  const pushed = [];
  const toasts = [];
  let fetchedNext = 0;
  let refetched = 0;
  const list = {
    data: {
      pages: [
        [
          {
            id: "3",
            title: "투표 결과가 나왔어요",
            body: "'고민돼요' 투표가 종료됐어요. BUY 1 · NOT 2",
            createdAt: "2026-10-21T00:00:00.000000+00:00",
            postId: "41",
            postType: "vote",
            isPostAvailable: true,
          },
          {
            id: "2",
            title: "내 게시글에 댓글이 달렸어요",
            body: "디기 1: 예뻐요",
            createdAt: "2026-10-20T00:00:00.000000+00:00",
            postId: "40",
            postType: "post",
            isPostAvailable: false,
          },
          {
            id: "1",
            title: "투표 결과가 나왔어요",
            body: "'지운 투표' 투표가 종료됐어요. BUY 0 · NOT 0",
            createdAt: "2026-10-19T00:00:00.000000+00:00",
            postId: "39",
            postType: "vote",
            isPostAvailable: false,
          },
        ],
      ],
    },
    isPending: false,
    isError: false,
    hasNextPage: true,
    isFetching: false,
    isFetchNextPageError: false,
    isFetchingNextPage: false,
    fetchNextPage: async () => {
      fetchedNext += 1;
    },
    refetch: async () => {
      refetched += 1;
    },
  };
  const { default: Route } = load(
    "../src/app/notifications.tsx",
    {
      "react-native": { Alert: { alert: () => {} }, Linking: { openSettings: async () => {} } },
      "expo-router": {
        useLocalSearchParams: () => ({}),
        useRouter: () => ({ push: (route) => pushed.push(route) }),
      },
      "@/screens/notification/NotificationScreen": { NotificationScreen: "NotificationScreen" },
      "@/components/MemberOnly": { MemberOnly: "MemberOnly" },
      "@/screens/notification/hooks/useDevicePushOff": {
        useDevicePushOff: () => ({ isPushOff: false, dismissedUntil: 0, dismiss: () => {} }),
      },
      "@/screens/notification/queries/useNotifications": { useNotifications: () => list },
      "@/screens/notification/queries/useNotificationCheck": {
        useNotificationCheck: () => ({
          data: "2026-10-20T12:00:00.000000+00:00",
          isPending: false,
          isError: false,
        }),
      },
      "@/screens/diggle/utils/formatCommunityTime": { formatCommunityTime: () => "1시간 전" },
      "@/hooks/useToast": {
        useToast: () => (message, variant) => toasts.push([message, variant]),
      },
      "@/constants/messages": {
        TOAST_MESSAGES: {
          NOTI_004: "삭제되었거나 더 이상 볼 수 없는 콘텐츠입니다.",
          VOTE_007: "삭제되었거나 더 이상 볼 수 없는 투표입니다.",
        },
      },
    },
    { __DEV__: false },
  );
  const props = member(Route).props;
  assert.deepEqual(
    props.notifications.map((item) => [item.title, item.message, item.timeLabel, item.isRead]),
    [
      ["투표 결과가 나왔어요", "'고민돼요' 투표가 종료됐어요. BUY 1 · NOT 2", "1시간 전", false],
      ["내 게시글에 댓글이 달렸어요", "디기 1: 예뻐요", "1시간 전", true],
      ["투표 결과가 나왔어요", "'지운 투표' 투표가 종료됐어요. BUY 0 · NOT 0", "1시간 전", true],
    ],
    "지난번 알림함을 연 뒤에 온 알림만 안 읽음으로 보인다",
  );
  props.onPressNotification(props.notifications[0]);
  props.onPressNotification(props.notifications[1]);
  props.onPressNotification(props.notifications[2]);
  assert.deepEqual(JSON.parse(JSON.stringify(pushed)), [
    { pathname: "/votes/[id]", params: { id: "41" } },
  ]);
  assert.deepEqual(
    toasts,
    [
      ["삭제되었거나 더 이상 볼 수 없는 콘텐츠입니다.", "error"],
      ["삭제되었거나 더 이상 볼 수 없는 투표입니다.", "error"],
    ],
    "지워진 글은 이동하지 않고 목록에서 안내하고, 투표는 투표 문구로 안내한다(NOTI-006)",
  );
  props.onEndReached();
  assert.equal(fetchedNext, 1);
  props.onRetry();
  assert.equal(refetched, 1);
});

test("종 아이콘은 지난 확인 뒤 새 알림이 있으면 빨간 점 아이콘으로 바뀐다", () => {
  for (const hasUnread of [true, false]) {
    const { NotificationButton } = load("../src/components/app-bar/NotificationButton.tsx", {
      "@/assets/images/appbar": { IconNotification: "Bell", IconNotificationDot: "BellDot" },
      "@/hooks/useHasUnreadNotifications": { useHasUnreadNotifications: () => hasUnread },
      "./IconButton": { IconButton: "IconButton" },
    });
    const onPress = () => {};
    const button = NotificationButton({ onPress });
    assert.equal(button.props.icon, hasUnread ? "BellDot" : "Bell");
    assert.equal(button.props.accessibilityLabel, hasUnread ? "알림, 새 알림 있음" : "알림");
    assert.equal(button.props.onPress, onPress);
  }
});
