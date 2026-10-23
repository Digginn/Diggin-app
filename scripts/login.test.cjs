/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function loadLoginIntent() {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "../src/lib/loginIntent.ts"), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { module, exports: module.exports },
  );
  return module.exports;
}
const loginIntent = loadLoginIntent();

function load(relativePath, mocks = {}) {
  const source = readFileSync(path.join(__dirname, "../src", relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const componentModule = { exports: {} };
  runInNewContext(compiled, {
    process: { env: {} },
    setTimeout: (callback) => callback(),
    exports: componentModule.exports,
    module: componentModule,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name === "@/api/accountAccess")
        return {
          ensureCommunityWriteAllowed: async () => undefined,
          restrictionMessage: () => null,
          fetchAccountAccess: async () => ({ status: "active" }),
        };
      if (name === "@/components/AccountAccessNotice")
        return { AccountAccessNotice: "AccountAccessNotice" };
      if (name === "@/theme") return load("theme/colors.ts");
      if (name === "@/screens/diggle/components/SanctionNoticeModal")
        return { SanctionNoticeModal: "SanctionNoticeModal" };
      if (name.endsWith(".svg")) return { __esModule: true, default: name };
      if (name === "react-native") return { View: "View", Text: "Text", Pressable: "Pressable" };
      if (name === "@/lib/loginIntent") return loginIntent;
      return require(name);
    },
  });
  return componentModule.exports;
}

function nodes(root) {
  const result = [];
  function visit(node) {
    if (!React.isValidElement(node)) return;
    result.push(node);
    React.Children.forEach(node.props.children, visit);
  }
  visit(root);
  return result;
}

test("소셜 버튼이 공통 Button과 지정 로고·색상·콜백을 사용한다", () => {
  const { colors } = load("theme/colors.ts");
  assert.equal(colors.accent.blue, "#0088FF");
  assert.equal(colors.accent.pink, "#FF2D55");
  const { SocialLoginButton } = load("screens/login/components/SocialLoginButton.tsx", {
    "@/components/Button": { Button: "Button" },
    "@/theme": { colors },
  });
  for (const [provider, label, bgColor, variant] of [
    ["google", "Google로 로그인", colors.gray[100], "secondary"],
    ["kakao", "Kakao로 로그인", colors.brand.kakao, "secondary"],
    ["apple", "Apple로 로그인", colors.gray[900], "primary"],
  ]) {
    const onPress = () => {};
    const button = SocialLoginButton({ provider, onPress });
    assert.equal(button.type, "Button");
    assert.equal(button.props.onPress, onPress);
    assert.equal(button.props.accessibilityLabel, label);
    assert.equal(button.props.variant, variant);
    assert.equal(button.props.bgColor, bgColor);
    const logo = nodes(button).find(
      (node) => node.type === `@/assets/images/icon-login-${provider}.svg`,
    );
    assert.ok(logo);
    assert.equal(logo.props.width, undefined);
    assert.equal(logo.props.height, undefined);
  }
});

test("루트는 폰트·세션 복원이 끝난 뒤 앱과 전역 제재 안내를 표시한다", () => {
  let isLoaded = false,
    isRestoring = false,
    effect,
    hidden = 0;
  const providers = ["Auth", "BlockedUsers", "BrowsingMode", "PostDraft", "Posts", "Toast"];
  const mocks = {
    "expo-font": { useFonts: () => [isLoaded, null] },
    "expo-router": { Stack: "Stack" },
    "expo-status-bar": { StatusBar: "StatusBar" },
    "expo-splash-screen": {
      preventAutoHideAsync() {},
      hideAsync() {
        hidden++;
      },
    },
    "react": {
      useEffect: (callback) => {
        effect = callback;
      },
    },
    "@/global.css": {},
    "@/lib/queryClient": { queryClient: {} },
    "@tanstack/react-query": { QueryClientProvider: "QueryClientProvider" },
    "@/screens/login/components/SessionExpiredModal": {
      SessionExpiredModal: "SessionExpiredModal",
    },
    "@/lib/pushNotifications": { registerDevicePush: async () => {} },
    "@/components/AndroidPushNotifications": {
      AndroidPushNotifications: "AndroidPushNotifications",
    },
    "@/lib/sharedSaves": { readSharedSaveTime: async () => 0 },
    "@/api/folders": { folderKeys: { all: ["folders"] } },
    "@/api/products": { productKeys: { all: ["products"] } },
  };
  for (const name of providers)
    mocks[`@/contexts/${name}Context`] = {
      [`${name}Provider`]: `${name}Provider`,
      ...(name === "Auth" ? { useAuth: () => ({ isRestoring }) } : {}),
    };
  for (const name of ["Regular", "Medium", "SemiBold", "Bold"])
    mocks[`@/assets/fonts/Pretendard-${name}.otf`] = 1;
  const { default: RootLayout } = load("app/_layout.tsx", mocks);
  const gate = () => RootLayout().props.children.props.children;
  assert.equal(gate().type(gate().props), null);
  effect();
  assert.equal(hidden, 0);
  isLoaded = true;
  const content = gate().type(gate().props);
  effect();
  assert.equal(hidden, 1);
  const tree = nodes(content);
  assert.ok(
    tree.some((node) => node.type === "Stack" && node.props.screenOptions.headerShown === false),
  );
  assert.ok(tree.some((node) => node.type === "AccountAccessNotice"));
  assert.ok(tree.some((node) => node.type?.name === "PushRegistration"));
  isRestoring = true;
  assert.equal(gate().type(gate().props), null);
});

for (const os of ["ios", "android"]) {
  test(`${os}: 로그인 화면의 둘러보기·뒤로 가기와 OS별 소셜 로그인이 정상 동작한다`, () => {
    const expectedProviders = os === "ios" ? "google,kakao,apple" : "google,kakao";
    const routes = [];
    const alerts = [];
    const signIns = [];
    let canGoBack = false;
    const { LoginScreen } = load("screens/login/LoginScreen.tsx", {
      "react": {
        useState: (initial) => [initial, () => {}],
        useRef: (current) => ({ current }),
        useEffect: () => {},
      },
      "@/lib/pendingShareLink": { discardShareLink: () => {} },
      "./api/signIn": {
        signIn: (provider) => {
          signIns.push(provider);
          return Promise.resolve({ status: "cancelled" });
        },
      },
      "expo-router": {
        useLocalSearchParams: () => ({}),
        useRouter: () => ({
          replace: (route) => routes.push(route),
          back: () => routes.push("back"),
          canGoBack: () => canGoBack,
        }),
      },
      "expo-status-bar": { StatusBar: "StatusBar" },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 50, bottom: 34 }) },
      "react-native": {
        Platform: { OS: os },
        View: "View",
        Text: "Text",
        Pressable: "Pressable",
        ScrollView: "ScrollView",
        useWindowDimensions: () => ({ height: 812 }),
        Alert: { alert: (...args) => alerts.push(args) },
      },
      "@/components/app-bar": { AppBar: "AppBar" },
      "@/components/LoadingDialog": { LoadingDialog: "LoadingDialog" },
      "@/components/ToastText": { ToastText: "ToastText" },
      "./components/SocialLoginButton": { SocialLoginButton: "SocialLoginButton" },
      "@/contexts/AuthContext": { useAuth: () => ({ session: null }) },
    });
    const tree = nodes(LoginScreen());
    const bar = tree.find((node) => node.type === "AppBar");
    assert.equal(bar.props.backIconSize, 24);
    assert.equal(bar.props.left, "back");
    assert.ok(!tree.some((node) => node.type === "ToastText"));
    bar.props.onBack();
    assert.equal(routes.at(-1), "/");
    canGoBack = true;
    bar.props.onBack();
    assert.equal(routes.at(-1), "back");
    const scroll = tree.find((node) => node.type === "ScrollView");
    assert.equal(scroll.props.contentContainerStyle.minHeight, 706);
    assert.equal(scroll.props.contentContainerStyle.paddingBottom, 36);
    const providers = tree.filter((node) => node.type === "SocialLoginButton");
    assert.equal(providers.map((node) => node.props.provider).join(","), expectedProviders);
    for (const button of providers) button.props.onPress();
    assert.equal(signIns.join(","), expectedProviders);
    assert.equal(alerts.length, 0);
    const buttons = tree.filter((node) => node.type === "Pressable");
    buttons[0].props.onPress();
    assert.equal(routes.at(-1), "/browse");
    buttons[1].props.onPress();
    buttons[2].props.onPress();
    assert.equal(alerts.at(-2)[0], "이용약관");
    assert.equal(alerts.at(-1)[0], "개인정보 처리방침");
    const errorTree = nodes(LoginScreen({ isLoginError: true }));
    const toast = errorTree.find((node) => node.type === "ToastText");
    assert.equal(toast.props.message, "로그인에 실패했습니다. 다시 시도해 주세요.");
    assert.equal(errorTree.find((node) => node.type === "AppBar").props.left, "none");
    assert.equal(
      errorTree.filter((node) => node.type === "SocialLoginButton").length,
      os === "ios" ? 3 : 2,
    );
    assert.ok(errorTree.some((node) => node.props.className?.includes("top-[-54px]")));
    const loadingTree = nodes(LoginScreen({ isLoginLoading: true }));
    const loadingDialog = loadingTree.find((node) => node.type === "LoadingDialog");
    assert.equal(loadingDialog.props.message, "로그인 중입니다.");
  });
}

function loadPendingShare() {
  const files = new Map();
  class File {
    constructor(folder, name) {
      this.path = `${folder.path}/${name}`;
    }
    get exists() {
      return files.has(this.path);
    }
    async text() {
      return files.get(this.path);
    }
    write(value) {
      files.set(this.path, value);
    }
    delete() {
      files.delete(this.path);
    }
  }
  const pending = load("lib/pendingShareLink.ts", {
    "expo-file-system": {
      File,
      Paths: { appleSharedContainers: { "group.com.diggin.app.preview": { path: "/group" } } },
    },
    "react-native": { Platform: { OS: "ios" } },
    "@/constants/appGroup": { APP_GROUP: "group.com.diggin.app.preview" },
    "@/utils/itemLink": load("utils/itemLink.ts"),
  });
  return { pending, files };
}

test("비회원 공유 링크는 App Group에 맡겨 로그인 뒤 한 번만 꺼내고, 오래됐거나 웹 링크가 아니면 버린다", async () => {
  const LINK = "https://www.musinsa.com/products/1";
  const { pending, files } = loadPendingShare();
  pending.keepShareLink(LINK);
  assert.ok(files.has("/group/pending-share"), "앱과 확장만 쓰는 보관함에 둔다");
  assert.equal(await pending.takeShareLink(), LINK);
  assert.equal(await pending.takeShareLink(), null, "한 번만 꺼낸다");
  assert.equal(files.size, 0, "꺼내면 지운다");

  pending.keepShareLink("javascript:alert(1)");
  assert.equal(await pending.takeShareLink(), null, "웹 링크가 아니면 버린다");
  files.set("/group/pending-share", "{깨진");
  assert.equal(await pending.takeShareLink(), null);
  files.set(
    "/group/pending-share",
    JSON.stringify({ url: LINK, savedAt: Date.now() - 11 * 60 * 1000 }),
  );
  assert.equal(await pending.takeShareLink(), null, "10분 넘게 묵은 공유는 버린다");

  pending.keepShareLink(LINK);
  pending.discardShareLink();
  assert.equal(await pending.takeShareLink(), null);
});

test("로그인 화면은 주소로 온 공유 링크를 받지 않고, 로그인하지 않고 나가면 맡긴 링크를 버린다", async () => {
  const LINK = "https://www.musinsa.com/products/1";
  const render = (signIn, pending) => {
    let cleanup;
    const { LoginScreen } = load("screens/login/LoginScreen.tsx", {
      "react": {
        useState: (initial) => [initial, () => {}],
        useRef: (current) => ({ current }),
        useEffect: (effect) => {
          cleanup = effect();
        },
      },
      "./api/signIn": { signIn },
      "@/lib/pendingShareLink": pending,
      "expo-router": {
        // 다른 앱이 diggin://login?shareUrl=… 로 열어도 쓰지 않는다.
        useLocalSearchParams: () => ({ shareUrl: "https://attacker.example/x" }),
        useRouter: () => ({ replace: () => {}, back: () => {}, canGoBack: () => false }),
      },
      "expo-status-bar": { StatusBar: "StatusBar" },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
      "react-native": {
        Platform: { OS: "ios" },
        View: "View",
        Text: "Text",
        Pressable: "Pressable",
        ScrollView: "ScrollView",
        useWindowDimensions: () => ({ height: 812 }),
        Alert: { alert: () => {} },
      },
      "@/components/app-bar": { AppBar: "AppBar" },
      "@/components/LoadingDialog": { LoadingDialog: "LoadingDialog" },
      "@/components/ToastText": { ToastText: "ToastText" },
      "./components/SocialLoginButton": { SocialLoginButton: "SocialLoginButton" },
      "@/contexts/AuthContext": { useAuth: () => ({ session: null }) },
    });
    const press = () =>
      nodes(LoginScreen())
        .find((node) => node.type === "SocialLoginButton")
        .props.onPress();
    return { press, leave: () => cleanup?.() };
  };

  const success = loadPendingShare();
  success.pending.keepShareLink(LINK);
  const loggedIn = render(async () => ({ status: "success", isNewUser: false }), success.pending);
  await loggedIn.press();
  loggedIn.leave();
  assert.equal(await success.pending.takeShareLink(), LINK, "로그인하면 ALL 탭이 꺼내도록 남긴다");

  const failed = loadPendingShare();
  failed.pending.keepShareLink(LINK);
  const retry = render(async () => {
    throw new Error("network");
  }, failed.pending);
  await retry.press();
  assert.ok(failed.files.size > 0, "로그인 실패는 다시 시도할 수 있게 둔다");
  retry.leave();
  assert.equal(failed.files.size, 0, "로그인하지 않고 나가면 버린다");

  const external = loadPendingShare();
  const fromLink = render(async () => ({ status: "success", isNewUser: false }), external.pending);
  await fromLink.press();
  assert.equal(await external.pending.takeShareLink(), null, "주소의 shareUrl은 맡기지 않는다");
});

test("이미 로그인한 사람의 자동 이동은 공유 링크를 보존하고, 로그인 중 세션은 원래 이동에 맡긴다", async () => {
  const render = (props, session, loading = false, pending = { discardShareLink: () => {} }) => {
    let stateIndex = 0;
    const cleanups = [];
    const { LoginScreen } = load("screens/login/LoginScreen.tsx", {
      "react": {
        // 두 번째 상태가 로그인 진행 중(isLoading)이다.
        useState: (initial) => [stateIndex++ === 1 && loading ? true : initial, () => {}],
        useRef: (current) => ({ current }),
        useEffect: (effect) => {
          const cleanup = effect();
          if (cleanup) cleanups.push(cleanup);
        },
      },
      "./api/signIn": { signIn: async () => ({ status: "cancelled" }) },
      "@/lib/pendingShareLink": pending,
      "expo-router": {
        Redirect: "Redirect",
        useRouter: () => ({ replace: () => {}, back: () => {}, canGoBack: () => false }),
      },
      "expo-status-bar": { StatusBar: "StatusBar" },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
      "react-native": {
        Platform: { OS: "ios" },
        View: "View",
        Text: "Text",
        Pressable: "Pressable",
        ScrollView: "ScrollView",
        useWindowDimensions: () => ({ height: 812 }),
        Alert: { alert: () => {} },
      },
      "@/components/app-bar": { AppBar: "AppBar" },
      "@/components/LoadingDialog": { LoadingDialog: "LoadingDialog" },
      "@/components/ToastText": { ToastText: "ToastText" },
      "./components/SocialLoginButton": { SocialLoginButton: "SocialLoginButton" },
      "@/contexts/AuthContext": { useAuth: () => ({ session }) },
    });
    return { tree: LoginScreen(props), leave: () => cleanups.forEach((cleanup) => cleanup()) };
  };
  const member = { user: { id: "u" } };
  const LINK = "https://www.musinsa.com/products/1";
  const shared = loadPendingShare();
  shared.pending.keepShareLink(LINK);
  const authenticated = render({ isRedirectedWhenSignedIn: true }, member, false, shared.pending);
  const redirect = authenticated.tree;
  assert.equal(redirect.type, "Redirect");
  assert.equal(redirect.props.href, "/(tabs)/all");
  authenticated.leave();
  assert.equal(await shared.pending.takeShareLink(), LINK, "자동 이동 후 ALL이 공유 링크를 받는다");
  assert.equal(await shared.pending.takeShareLink(), null, "공유 링크는 한 번만 이어 저장한다");

  const cancelled = loadPendingShare();
  cancelled.pending.keepShareLink(LINK);
  const guest = render({ isRedirectedWhenSignedIn: true }, null, false, cancelled.pending);
  assert.notEqual(guest.tree.type, "Redirect");
  guest.leave();
  assert.equal(await cancelled.pending.takeShareLink(), null, "비회원이 나가면 공유 링크를 버린다");
  assert.notEqual(render({}, member).tree.type, "Redirect", "미리보기 화면은 그대로 보인다");
  assert.notEqual(
    render({ isRedirectedWhenSignedIn: true }, member, true).tree.type,
    "Redirect",
    "로그인 중에 생긴 세션은 가입 완료 안내 등 원래 이동에 맡긴다",
  );
});

test("ALL 탭은 로그인한 뒤에만 맡긴 공유 링크를 꺼내 저장을 이어 간다", async () => {
  const run = async (session, pathname) => {
    const started = [];
    let taken = 0;
    const effects = [];
    const { default: TabLayout } = load("app/(tabs)/_layout.tsx", {
      "react": { useEffect: (effect) => effects.push(effect) },
      "expo-router": {
        Tabs: Object.assign(() => null, { Screen: "Screen" }),
        usePathname: () => pathname,
      },
      "@/contexts/AuthContext": { useAuth: () => ({ session }) },
      "@/hooks/useItemSave": {
        useItemSave: () => ({ start: (url) => started.push(url), isBusy: false }),
      },
      "@/hooks/useLoginGate": {
        useLoginGate: () => ({ requireLogin: (action) => action(), loginModal: null }),
      },
      "@/lib/pendingShareLink": {
        takeShareLink: async () => {
          taken += 1;
          return "https://www.musinsa.com/products/1";
        },
      },
      "@/components/ItemSaveFlow": { ItemSaveFlow: "ItemSaveFlow" },
      "@/components/LinkDetectModal": { LinkDetectModal: "LinkDetectModal" },
      "@/components/NavigationBar": { NavigationBar: "NavigationBar" },
    });
    TabLayout();
    for (const effect of effects) effect();
    await new Promise((resolve) => setImmediate(resolve));
    return { started, taken };
  };
  assert.deepEqual(
    await run(null, "/all"),
    { started: [], taken: 0 },
    "둘러보기 비회원은 꺼내지 않는다",
  );
  assert.deepEqual(await run({ user: { id: "u" } }, "/folder"), { started: [], taken: 0 });
  assert.deepEqual(await run({ user: { id: "u" } }, "/all"), {
    started: ["https://www.musinsa.com/products/1"],
    taken: 1,
  });
});

test("토스트는 디자인 토큰을 사용하고 터치 방해 없이 오류를 안내한다", () => {
  const { ToastText } = load("components/ToastText.tsx", {
    "@/assets/images/toast": { IconToastError: "IconToastError" },
  });
  const toast = ToastText({ message: "로그인 실패" });
  assert.equal(toast.props.pointerEvents, "none");
  assert.equal(toast.props.accessibilityRole, "alert");
  assert.equal(toast.props.accessibilityLiveRegion, "polite");
  for (const token of ["bg-semantic-toast", "p-3"]) {
    assert.ok(toast.props.className.includes(token));
  }
  const text = nodes(toast).find((node) => node.type === "Text");
  assert.ok(text.props.className.includes("text-gray-0"));
  assert.ok(text.props.className.includes("font-label-14"));
  assert.equal(text.props.accessibilityLabel, "로그인 실패");
  assert.equal(text.props.children.replaceAll("\u2060", ""), "로그인 실패");
});

test("AppBar는 로그인용 아이콘 옵션과 develop의 다크모드·제목 옵션을 함께 유지한다", () => {
  const routes = [];
  const { AppBar } = load("components/app-bar/AppBar.tsx", {
    "expo-router": { useRouter: () => ({ back: () => routes.push("back") }) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 24 }) },
    "@/assets/images/appbar": { IconBack: "DefaultBack" },
    "./IconButton": { IconButton: "IconButton" },
    "./TextButton": { TextButton: "TextButton" },
  });
  const dark = nodes(
    AppBar({
      title: "제목",
      titleClassName: "font-h2",
      colorScheme: "dark",
      backIcon: "LoginBack",
      backIconSize: 24,
    }),
  );
  assert.equal(dark[0].props.className, "bg-gray-1000");
  assert.equal(dark[0].props.style.paddingTop, 24);
  const icon = dark.find((node) => node.type === "IconButton");
  assert.equal(icon.props.icon, "LoginBack");
  assert.equal(icon.props.iconSize, 24);
  assert.equal(icon.props.className, "text-gray-0");
  icon.props.onPress();
  assert.deepEqual(routes, ["back"]);
  const title = dark.find((node) => node.type === "Text");
  assert.ok(title.props.className.includes("font-h2"));
  assert.ok(title.props.className.includes("text-gray-0"));
  const light = nodes(AppBar({})).find((node) => node.type === "IconButton");
  assert.equal(light.props.icon, "DefaultBack");
  assert.equal(light.props.iconSize, 48);
  assert.equal(light.props.className, "text-gray-900");
  const customLogo = React.createElement("FolderLogo");
  const folder = nodes(
    AppBar({ title: "폴더 이름", left: "logo", logo: customLogo, isTitleLeftAligned: true }),
  );
  assert.ok(folder.includes(customLogo));
  assert.ok(
    folder.some(
      (node) => node.props.className?.includes("items-start") && node.props.style?.left === 48,
    ),
  );
  assert.ok(folder.find((node) => node.type === "Text").props.className.includes("font-h2"));
});

test("공통 아이콘 버튼의 기존 48px 기본값과 로그인용 24px 옵션을 유지한다", () => {
  const { IconButton } = load("components/app-bar/IconButton.tsx");
  const props = { icon: "Icon", accessibilityLabel: "뒤로 가기" };
  assert.equal(IconButton(props).props.children.props.width, 48);
  const button = IconButton({ ...props, iconSize: 24 });
  assert.equal(button.props.children.props.width, 24);
  assert.equal(button.props.children.props.height, 24);
  assert.ok(button.props.className.includes("size-[48px]"));
});

test("로그인 로딩 스피너는 한 바퀴에 약 0.8초가 걸린다", () => {
  const source = readFileSync(path.join(__dirname, "../src/components/LoadingDialog.tsx"), "utf8");
  assert.match(source, /withRepeat\(\s*withTiming\(360/);
  const duration = Number(source.match(/duration:\s*(\d+)/)?.[1]);
  const degrees = Number(source.match(/withTiming\((\d+)/)?.[1]);
  assert.equal((duration * 360) / degrees, 800);
});

test("인증 만료 안내는 확인 버튼 하나만 두고 확인하면 앱 시작 화면으로 이동한다", () => {
  const { SessionExpiredModal } = load("screens/login/components/SessionExpiredModal.tsx", {
    "@/components/modal": { ActionModal: "ActionModal" },
  });
  let isVisible = true;
  const routes = [];
  const { default: Preview } = load("app/auth-expired-preview.tsx", {
    "react": {
      ...React,
      useState: () => [
        isVisible,
        (value) => {
          isVisible = value;
        },
      ],
    },
    "expo-router": { useRouter: () => ({ replace: (route) => routes.push(route) }) },
    "@/screens/all/AllScreen": { AllScreen: "AllScreen" },
    "@/screens/login/components/SessionExpiredModal": { SessionExpiredModal },
  });
  const previewModal = () => nodes(Preview()).find((node) => node.type === SessionExpiredModal);
  const modal = SessionExpiredModal(previewModal().props);
  assert.equal(modal.type, "ActionModal");
  assert.equal(modal.props.visible, true);
  assert.equal(modal.props.title, "다시 로그인해 주세요.");
  assert.equal(modal.props.description, "로그인 정보가 만료되어 다시 로그인이 필요합니다.");
  assert.equal(modal.props.type, undefined, "기본값 1Btn을 쓴다");
  assert.equal(modal.props.secondaryAction, undefined);
  assert.equal(modal.props.onClose, undefined, "닫기(X) 버튼을 두지 않는다");
  assert.equal(modal.props.isPrimaryDisabled, false);
  assert.equal(modal.props.primaryAction.label, "확인");
  modal.props.onRequestClose();
  assert.equal(routes.length, 0, "뒤로가기로는 닫히지 않는다");
  modal.props.primaryAction.onPress();
  assert.equal(previewModal().props.visible, false);
  assert.deepEqual(routes, ["/"]);
});

test("직접 로그아웃은 만료로 보지 않고, 그 외 SIGNED_OUT만 인증 만료로 안내한다", async () => {
  const state = [];
  let cursor = 0;
  let emit;
  const signOutOptions = [];
  const order = [];
  const cacheClears = [];
  const supabase = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { id: "s" } } }),
      onAuthStateChange: (listener) => {
        emit = listener;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: async (options) => {
        signOutOptions.push(options);
        order.push("signOut");
        emit("SIGNED_OUT", null);
        return { error: null };
      },
    },
  };
  const refs = [];
  let refCursor = 0;
  const { AuthProvider } = load("contexts/AuthContext.tsx", {
    "react": {
      ...React,
      createContext: () => ({ Provider: "Provider" }),
      useEffect: (effect) => effect(),
      useRef: (initial) => {
        const index = refCursor++;
        if (!(index in refs)) refs[index] = { current: initial };
        return refs[index];
      },
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (next) => (state[index] = next)];
      },
    },
    "@/lib/supabase": { supabase },
    "@/lib/queryClient": { queryClient: { clear: () => cacheClears.push(true) } },
    "@/lib/pushNotifications": {
      unregisterDevicePush: async () => {
        order.push("unregisterPush");
      },
      finishDeviceSignOut: () => order.push("finishPush"),
    },
  });
  const render = () => {
    cursor = 0;
    refCursor = 0;
    return AuthProvider({ children: null }).props.value;
  };
  await render().signOut();
  assert.equal(signOutOptions.length, 1);
  assert.equal(signOutOptions[0].scope, "local", "이 기기 세션만 끊는다");
  assert.deepEqual(
    order,
    ["unregisterPush", "signOut", "finishPush"],
    "세션을 끊기 전에 이 기기 Push 토큰을 지우고, 세션을 끊은 뒤에야 등록 막기를 푼다",
  );
  assert.equal(render().isSessionExpired, false);
  emit("TOKEN_REFRESHED", { id: "s2" });
  assert.equal(render().isSessionExpired, false);
  emit("SIGNED_OUT", null);
  await Promise.resolve();
  assert.equal(render().isSessionExpired, true);
  assert.equal(cacheClears.length, 2, "로그아웃·만료 모두 상품 캐시를 비운다");
  render().confirmSessionExpired();
  assert.equal(render().isSessionExpired, false);
});

function loadSignIn({
  getUser,
  kakao = {},
  saveAvatar = async () => {},
  authError = null,
  restrictionNotice = null,
  os = "ios",
}) {
  const storage = new Map();
  return load("screens/login/api/signIn.ts", {
    "@react-native-async-storage/async-storage": {
      __esModule: true,
      default: {
        getItem: async (key) => storage.get(key) ?? null,
        setItem: async (key, value) => storage.set(key, value),
      },
    },
    "@react-native-google-signin/google-signin": {
      GoogleSignin: {
        configure() {},
        hasPlayServices: async () => true,
        signIn: async () => ({ type: "success", data: { idToken: "token" } }),
      },
      isCancelledResponse: (response) => response.type === "cancelled",
      isErrorWithCode: () => false,
      statusCodes: {},
    },
    "@react-native-kakao/core": { initializeKakaoSDK: async () => {} },
    "@react-native-kakao/user": {
      login: async () => ({ idToken: "kakao-token" }),
      me: async () => ({ profileImageUrl: "" }),
      ...kakao,
    },
    "expo-apple-authentication": {},
    "expo-linking": {},
    "expo-web-browser": {},
    "react-native": { Platform: { OS: os } },
    "@/api/avatar": { saveAvatar },
    "@/api/accountAccess": {
      ...load("api/accountAccess.ts", {
        "@/lib/supabase": { supabase: {} },
        "@/screens/diggle/utils/sanctionMessages": load("screens/diggle/utils/sanctionMessages.ts"),
      }),
      fetchAccountAccess: async () => ({ status: "active" }),
    },
    "@/lib/supabase": {
      supabase: {
        functions: {
          invoke: async (name, input) => {
            assert.equal(name, "account-restriction");
            assert.equal(input.body.provider, "google");
            assert.equal(input.body.id_token, "token");
            return { data: { notice: restrictionNotice }, error: null };
          },
        },
        auth: {
          signInWithIdToken: async () => ({ error: authError }),
          getUser: async () => ({ data: { user: getUser() }, error: null }),
        },
      },
    },
  });
}

test("가입 1분 안에 다시 로그인해도 가입 완료 안내는 사용자별로 한 번만 보여 준다", async () => {
  let user;
  const { signIn } = loadSignIn({ getUser: () => user });
  const signedUpAt = "2026-10-16T00:00:00Z";
  user = { id: "a", created_at: signedUpAt, last_sign_in_at: signedUpAt };
  assert.equal((await signIn("google")).isNewUser, true);
  user = { id: "a", created_at: signedUpAt, last_sign_in_at: "2026-10-16T00:00:30Z" };
  assert.equal((await signIn("google")).isNewUser, false);
  user = { id: "b", created_at: signedUpAt, last_sign_in_at: "2026-10-16T00:00:10Z" };
  assert.equal((await signIn("google")).isNewUser, true);
  user = { id: "c", created_at: signedUpAt, last_sign_in_at: "2026-10-16T00:01:00Z" };
  assert.equal((await signIn("google")).isNewUser, false);
});

test("카카오 신규 가입만 카카오 프로필 사진을 복사하고, 실패해도 로그인은 이어 간다", async () => {
  const signedUpAt = "2026-10-16T00:00:00Z";
  let user = { id: "k1", created_at: signedUpAt, last_sign_in_at: signedUpAt };
  const saved = [];
  let photoUrl = "https://k.kakaocdn.net/photo.jpg";
  const { signIn } = loadSignIn({
    getUser: () => user,
    kakao: { me: async () => ({ profileImageUrl: photoUrl }) },
    saveAvatar: async (uri) => {
      if (uri.includes("broken")) throw new Error("load_failed");
      saved.push(uri);
    },
  });
  assert.equal((await signIn("kakao")).isNewUser, true);
  assert.deepEqual(saved, ["https://k.kakaocdn.net/photo.jpg"]);

  user = { id: "k2", created_at: signedUpAt, last_sign_in_at: "2026-10-16T00:05:00Z" };
  assert.equal((await signIn("kakao")).isNewUser, false);
  assert.equal(saved.length, 1, "기존 회원은 복사하지 않는다");

  user = { id: "k3", created_at: signedUpAt, last_sign_in_at: signedUpAt };
  photoUrl = "";
  await signIn("kakao");
  assert.equal(saved.length, 1, "카카오 사진이 없으면 기본 이미지로 둔다");

  user = { id: "k4", created_at: signedUpAt, last_sign_in_at: signedUpAt };
  photoUrl = "https://k.kakaocdn.net/broken.jpg";
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal((await signIn("kakao")).status, "success", "사진 실패가 로그인을 막지 않는다");
  } finally {
    console.warn = warn;
  }
});

test("Auth ban 로그인은 가입 처리 없이 검증된 본인 제재 안내로 전환한다", async () => {
  const { signIn } = loadSignIn({
    getUser: () => assert.fail("must_not_load_user"),
    authError: { code: "user_banned" },
    restrictionNotice: { status: "suspended", sanction_id: "4", reason_category: "spam" },
  });
  const result = await signIn("google");
  assert.equal(result.status, "suspended");
  assert.equal(result.access.reasonCategory, "spam");
});
test("제재 상세를 조회하지 못해도 로그인 성공이나 임의 위반 유형을 만들지 않는다", async () => {
  const { signIn } = loadSignIn({
    getUser: () => assert.fail("must_not_load_user"),
    authError: { code: "user_banned" },
  });
  const result = await signIn("google");
  assert.equal(result.status, "suspended");
  assert.equal(result.access.reasonCategory, null);
});

test("Android에서는 Apple 인증을 직접 호출해도 실행하지 않는다", async () => {
  const { signIn } = loadSignIn({
    os: "android",
    getUser: () => assert.fail("must_not_load_user"),
  });
  await assert.rejects(signIn("apple"), /apple_login_not_supported/);
});

test("로그인 필요 모달에서 온 로그인은 성공하면 원래 화면으로 돌아가 이어 하고, 그만두면 버린다", async () => {
  const render = (result) => {
    const routes = [];
    let cleanup;
    const { LoginScreen } = load("screens/login/LoginScreen.tsx", {
      "react": {
        useState: (initial) => [initial, () => {}],
        useRef: (current) => ({ current }),
        useEffect: (effect) => {
          cleanup = effect();
        },
      },
      "./api/signIn": { signIn: async () => result },
      "@/contexts/AuthContext": { useAuth: () => ({ session: null }) },
      "@/lib/pendingShareLink": { discardShareLink: () => {} },
      "expo-router": {
        useRouter: () => ({
          replace: (route) => routes.push(route),
          back: () => routes.push("back"),
          canGoBack: () => true,
          push: (route) => routes.push(route),
        }),
      },
      "expo-status-bar": { StatusBar: "StatusBar" },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
      "react-native": {
        Platform: { OS: "ios" },
        View: "View",
        Text: "Text",
        Pressable: "Pressable",
        ScrollView: "ScrollView",
        useWindowDimensions: () => ({ height: 812 }),
        Alert: { alert: () => {} },
      },
      "@/components/app-bar": { AppBar: "AppBar" },
      "@/components/LoadingDialog": { LoadingDialog: "LoadingDialog" },
      "@/components/ToastText": { ToastText: "ToastText" },
      "./components/SocialLoginButton": { SocialLoginButton: "SocialLoginButton" },
    });
    const press = () =>
      nodes(LoginScreen())
        .find((node) => node.type === "SocialLoginButton")
        .props.onPress();
    return { routes, press, unmount: () => cleanup?.() };
  };
  const resumed = [];
  const router = { push: () => {} };

  loginIntent.startLogin(router, () => resumed.push("like"));
  const member = render({ status: "success", isNewUser: false });
  await member.press();
  member.unmount();
  assert.deepEqual(member.routes, ["back"], "원래 화면으로 돌아간다");
  assert.deepEqual(resumed, ["like"], "하려던 동작을 이어 한다");

  loginIntent.startLogin(router, () => resumed.push("vote"));
  const newbie = render({ status: "success", isNewUser: true });
  await newbie.press();
  newbie.unmount();
  assert.deepEqual(newbie.routes, ["/signup-complete"], "신규 회원은 가입 완료 안내를 먼저 본다");
  assert.deepEqual(resumed, ["like"]);
  loginIntent.takeLoginIntent()();
  assert.deepEqual(resumed, ["like", "vote"], "가입 완료 안내 뒤에 이어 한다");

  loginIntent.startLogin(router, () => resumed.push("write"));
  const leaving = render({ status: "cancelled" });
  await leaving.press();
  leaving.unmount();
  assert.equal(loginIntent.takeLoginIntent(), null, "로그인을 그만두면 버린다");

  const direct = render({ status: "success", isNewUser: false });
  await direct.press();
  assert.deepEqual(direct.routes, ["/(tabs)/all"], "모달 없이 온 로그인은 ALL로 간다");
});

test("회원 전용 화면은 비회원에게 화면 위 로그인 모달을 보이고, 로그인하면 이 화면으로 돌아오게 한다", () => {
  const routes = [];
  const render = (auth, isFocused = true) => {
    const { MemberOnly } = load("components/MemberOnly.tsx", {
      "expo-router": {
        useIsFocused: () => isFocused,
        useRouter: () => ({
          push: (route) => routes.push(route),
          back: () => routes.push("back"),
          canGoBack: () => true,
          replace: (route) => routes.push(route),
        }),
      },
      "react-native": { View: "View" },
      "@/components/app-bar": { AppBar: "AppBar" },
      "@/components/modal": { LoginRequiredModal: "LoginRequiredModal" },
      "@/contexts/AuthContext": { useAuth: () => auth },
    });
    return MemberOnly({ title: "알림", children: "CONTENT" });
  };
  assert.equal(render({ session: { user: { id: "u" } }, isRestoring: false }), "CONTENT");
  const guest = nodes(render({ session: null, isRestoring: false }));
  assert.ok(!guest.includes("CONTENT"), "비회원에게 내용을 그리지 않는다");
  assert.equal(guest.find((node) => node.type === "AppBar").props.title, "알림");
  const modal = guest.find((node) => node.type === "LoginRequiredModal");
  assert.equal(modal.props.visible, true);
  modal.props.onClose();
  assert.deepEqual(routes, ["back"]);
  modal.props.onLogin();
  assert.deepEqual(routes, ["back", "/login"]);
  assert.equal(typeof loginIntent.takeLoginIntent(), "function", "로그인하면 이 화면으로 돌아온다");
  assert.ok(
    !nodes(render({ session: null, isRestoring: true })).some(
      (node) => node.type === "LoginRequiredModal",
    ),
    "로그인 복원 중에는 모달을 띄우지 않는다",
  );
});
