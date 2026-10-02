/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function load(filename, mocks, globals = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(path.join(__dirname, filename), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    ...globals,
    exports: loaded.exports,
    module: loaded,
    require: (name) => mocks[name] ?? require(name),
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
      },
      { __DEV__: false },
    );
    Route().props.onBack();
    assert.deepEqual(events, [canGoBack ? "back" : "/(tabs)"]);
  }
});

test("개발용 오류 미리보기의 다시 시도는 목록으로 복귀하고 운영에는 샘플을 표시하지 않는다", () => {
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
  };
  const { default: PreviewRoute } = load("../src/app/notifications.tsx", mocks, { __DEV__: true });
  assert.equal(PreviewRoute().props.isError, true);
  PreviewRoute().props.onRetry();
  assert.equal(PreviewRoute().props.isError, false);
  assert.equal(PreviewRoute().props.notifications.length, 4);
  const { default: ProductionRoute } = load("../src/app/notifications.tsx", mocks, {
    __DEV__: false,
  });
  preview = "error";
  assert.equal(ProductionRoute().props.isError, false);
  assert.equal(ProductionRoute().props.onRetry, undefined);
  assert.equal(ProductionRoute().props.notifications.length, 0);
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
});
