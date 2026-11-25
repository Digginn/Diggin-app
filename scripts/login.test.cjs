/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

const loginConsents = [];
const analyticsEvents = [];
const loginToasts = [];
const showLoginToast = (message, variant) => loginToasts.push({ message, variant });
const analytics = {
  trackEvent: (name, properties) => analyticsEvents.push([name, properties]),
  flushAnalytics: async () => {},
  syncAnalyticsConsent: async () => {},
};

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
    ...mocks.globals,
    exports: componentModule.exports,
    module: componentModule,
    require: (name) => {
      // 로그인 화면이 새로 쓰는 훅은 기존 mock에 기본값을 채운다.
      if (name === "react" && mocks.react)
        return { useCallback: (callback) => callback, ...mocks.react };
      if (name === "expo-router" && mocks["expo-router"])
        return { useFocusEffect: () => {}, ...mocks["expo-router"] };
      if (name in mocks) return mocks[name];
      if (name === "expo-network")
        return {
          getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
        };
      if (name === "@/hooks/useToast") return { useToast: () => showLoginToast };
      if (name === "@/hooks/useNativeModalVisible")
        return {
          whenNativeModalIdle: (callback) => {
            callback();
            return () => {};
          },
        };
      if (name === "@/constants/messages") return load("constants/messages.ts");
      if (name === "./components/TermsConsentSheet")
        return {
          TermsConsentSheet: "TermsConsentSheet",
          EMPTY_TERMS_CONSENT: {
            age: false,
            terms: false,
            privacy: false,
            usageAnalysis: false,
            overseasTransfer: false,
          },
          isRequiredConsented: (consent) => consent.age && consent.terms && consent.privacy,
        };
      if (name === "./api/loginConsent")
        return {
          saveLoginAnalyticsConsent: async (isNewUser, consent) =>
            loginConsents.push([isNewUser, consent]),
        };
      if (name === "@/lib/analytics") return analytics;
      if (name === "@/lib/googleSignIn") return load("lib/googleSignIn.ts", mocks);
      if (name === "@/api/accountAccess")
        return {
          ensureCommunityWriteAllowed: async () => undefined,
          restrictionMessage: () => null,
          fetchAccountAccess: async () => ({ status: "active" }),
        };
      if (name === "@/components/AccountAccessNotice")
        return { AccountAccessNotice: "AccountAccessNotice" };
      if (name === "@/components/ProductImageFiller")
        return { ProductImageFiller: "ProductImageFiller" };
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

function stateHooks() {
  const states = [];
  const refs = [];
  let cursor = 0;
  let refCursor = 0;
  return {
    useRef(current) {
      const index = refCursor++;
      return refs[index] ?? (refs[index] = { current });
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [
        states[index],
        (next) => (states[index] = typeof next === "function" ? next(states[index]) : next),
      ];
    },
    render(screen) {
      cursor = 0;
      refCursor = 0;
      return nodes(screen());
    },
    reset() {
      states.length = 0;
      refs.length = 0;
    },
  };
}

const ALL_AGREED = {
  age: true,
  terms: true,
  privacy: true,
  usageAnalysis: true,
  overseasTransfer: true,
};

/** 계정 확인 후 필요한 경우에만 표시되는 동의 시트를 완료한다. */
async function pressSocialAfterConsent(hooks, screen, consent = ALL_AGREED, index = 0) {
  const login = hooks
    .render(screen)
    .filter((node) => node.type === "SocialLoginButton")
    [index].props.onPress();
  const sheet = () => hooks.render(screen).find((node) => node.type === "TermsConsentSheet");
  await new Promise(setImmediate);
  if (sheet().props.visible) {
    sheet().props.onChange(consent);
    sheet().props.onConfirm();
  }
  await login;
}

function loginNetworkScreen({ getNetwork, signIn, os = "ios" }) {
  const hooks = stateHooks();
  const toasts = [];
  const routes = [];
  const { LoginScreen } = load("screens/login/LoginScreen.tsx", {
    "react": { useState: hooks.useState, useRef: hooks.useRef, useEffect: (effect) => effect() },
    "expo-network": { getNetworkStateAsync: getNetwork },
    "./api/signIn": { signIn },
    "@/hooks/useToast": { useToast: () => (message, variant) => toasts.push({ message, variant }) },
    "@/contexts/AuthContext": { useAuth: () => ({ session: null }) },
    "@/lib/pendingShareLink": { discardShareLink() {} },
    "expo-router": {
      useRouter: () => ({ replace: (route) => routes.push(route), canGoBack: () => false }),
    },
    "expo-status-bar": { StatusBar: "StatusBar" },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "react-native": {
      View: "View",
      Text: "Text",
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      Platform: { OS: os },
      useWindowDimensions: () => ({ height: 812 }),
    },
    "@/components/app-bar": { AppBar: "AppBar" },
    "@/components/LoadingDialog": { LoadingDialog: "LoadingDialog" },
    "@/components/ToastText": { ToastText: "ToastText" },
    "@/components/UnderageNoticeModal": { UnderageNoticeModal: "UnderageNoticeModal" },
    "./components/SocialLoginButton": { SocialLoginButton: "SocialLoginButton" },
  });
  const render = () => hooks.render(LoginScreen);
  return {
    render,
    toasts,
    routes,
    press: (provider) =>
      render()
        .find((node) => node.type === "SocialLoginButton" && node.props.provider === provider)
        .props.onPress(),
    sheet: () => render().find((node) => node.type === "TermsConsentSheet"),
  };
}

test("오프라인 소셜 로그인은 세 SDK를 실행하지 않고 연결 안내 후 재시도할 수 있다", async () => {
  for (const os of ["ios", "android"]) {
    let online = false;
    const calls = [];
    const ui = loginNetworkScreen({
      os,
      getNetwork: async () => ({ isConnected: online, isInternetReachable: online }),
      signIn: async (provider) => {
        calls.push(provider);
        return { status: "cancelled" };
      },
    });
    for (const provider of os === "ios" ? ["google", "kakao", "apple"] : ["google", "kakao"]) {
      for (let retry = 0; retry < 2; retry++) {
        await ui.press(provider);
        const tree = ui.render();
        assert.deepEqual(ui.toasts.at(-1), {
          message: "연결 상태를 확인한 후 다시 시도해 주세요.",
          variant: "error",
        });
        assert.equal(
          tree.some((node) => node.type === "LoadingDialog"),
          false,
        );
        assert.equal(ui.sheet().props.visible, false);
      }
    }
    assert.deepEqual(calls, []);
    assert.deepEqual(ui.routes, []);
    online = true;
    await ui.press("google");
    assert.deepEqual(calls, ["google"], "연결 복구 후 로그인 잠금이 남지 않는다");
  }
});

test("소셜 SDK의 연결 오류·일반 실패는 구분된 전역 Error Toast로 알린다", async () => {
  for (const error of [new Error("Network request failed"), new Error("provider_failed")]) {
    const ui = loginNetworkScreen({
      getNetwork: async () => ({ isConnected: true }),
      signIn: async (_provider, onAuthorized) => {
        onAuthorized();
        throw error;
      },
    });
    for (const provider of ["google", "kakao", "apple"]) {
      await ui.press(provider);
      const tree = ui.render();
      assert.deepEqual(ui.toasts.at(-1), {
        message: error.message.includes("Network")
          ? "연결 상태를 확인한 후 다시 시도해 주세요."
          : "로그인에 실패했습니다. 다시 시도해 주세요.",
        variant: "error",
      });
      assert.equal(
        tree.some((node) => node.type === "LoadingDialog"),
        false,
      );
      assert.equal(
        tree.some((node) => node.type === "ToastText"),
        false,
        "버튼 위의 로컬 Toast를 중복 표시하지 않는다",
      );
    }
  }
});

test("동의 후 로그인 실패 시 체크한 항목을 유지하며 재시도에서도 확인을 다시 받는다", async () => {
  const ui = loginNetworkScreen({
    getNetwork: async () => ({ isConnected: true }),
    signIn: async (_provider, onAuthorized, requestConsent) => {
      onAuthorized();
      const agreed = await requestConsent();
      if (!agreed) return { status: "cancelled" };
      throw new Error("Network request failed");
    },
  });
  const first = ui.press("apple");
  await new Promise(setImmediate);
  const selected = { ...ALL_AGREED, overseasTransfer: false };
  ui.sheet().props.onChange(selected);
  ui.sheet().props.onConfirm();
  await first;
  assert.equal(ui.sheet().props.visible, false);
  const retry = ui.press("apple");
  await new Promise(setImmediate);
  assert.equal(ui.sheet().props.visible, true);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.sheet().props.consent)), selected);
  ui.sheet().props.onClose();
  await retry;
  assert.deepEqual(ui.routes, []);
});

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
    "@/components/PushNotifications": {
      PushNotifications: "PushNotifications",
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
  test(`${os}: 로그인 화면의 둘러보기·뒤로 가기와 OS별 소셜 로그인이 정상 동작한다`, async () => {
    const expectedProviders = os === "ios" ? "google,kakao,apple" : "google,kakao";
    const routes = [];
    const alerts = [];
    const signIns = [];
    let canGoBack = false;
    let session = null;
    const hooks = stateHooks();
    const { LoginScreen } = load("screens/login/LoginScreen.tsx", {
      "react": {
        useState: hooks.useState,
        useRef: hooks.useRef,
        useEffect: (effect) => effect(),
      },
      "@/lib/pendingShareLink": { discardShareLink: () => {} },
      "./api/signIn": {
        signIn: async (provider, onAuthorized, requestConsent) => {
          signIns.push(provider);
          onAuthorized();
          const agreed = await requestConsent();
          return agreed ? { status: "success", isNewUser: false } : { status: "cancelled" };
        },
      },
      "expo-router": {
        useLocalSearchParams: () => ({}),
        useRouter: () => ({
          replace: (route) => routes.push(route),
          push: (route) => routes.push(route),
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
      "@/components/modal": { ActionModal: "ActionModal" },
      "@/components/UnderageNoticeModal": { UnderageNoticeModal: "UnderageNoticeModal" },
      "@/components/ToastText": { ToastText: "ToastText" },
      "./components/SocialLoginButton": { SocialLoginButton: "SocialLoginButton" },
      "@/contexts/AuthContext": { useAuth: () => ({ session }) },
    });
    const tree = hooks.render(LoginScreen);
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
    assert.ok(
      !tree.some((node) => node.props.accessibilityRole === "checkbox"),
      "필수 동의는 화면이 아니라 이용약관 동의 시트에서 받는다",
    );
    const sheet = () => hooks.render(LoginScreen).find((node) => node.type === "TermsConsentSheet");
    assert.equal(sheet().props.visible, false);
    for (const [index, provider] of expectedProviders.split(",").entries()) {
      const login = hooks
        .render(LoginScreen)
        .filter((node) => node.type === "SocialLoginButton")
        [index].props.onPress();
      await new Promise(setImmediate);
      assert.equal(sheet().props.visible, true, "계정 확인 결과 동의가 필요하면 시트를 띄운다");
      assert.equal(signIns.length, index + 1, "소셜 계정 선택을 먼저 진행한다");
      sheet().props.onChange({ ...ALL_AGREED, usageAnalysis: false });
      sheet().props.onConfirm();
      assert.equal(
        sheet().props.loadingMessage,
        "로그인 중입니다.",
        "동의 확인 후 계정 생성·인증을 완료하는 동안 표시한다",
      );
      session = { user: { id: "pending-consent-save" } };
      assert.ok(
        hooks
          .render(() => LoginScreen({ isRedirectedWhenSignedIn: true }))
          .some((node) => node.type === "TermsConsentSheet" && node.props.visible),
        "중간 인증 세션이 생겨도 필수 동의 저장 완료 전에 자동 이동하지 않는다",
      );
      session = null;
      await login;
      assert.equal(sheet().props.loadingMessage, undefined, "로그인 창을 취소하면 표시를 거둔다");
      assert.equal(
        signIns.at(-1),
        provider,
        "다시 누르지 않아도 고른 소셜 로그인으로 바로 이어진다",
      );
      assert.equal(sheet().props.visible, false, "동의와 로그인이 끝나면 시트를 닫는다");
      assert.equal(signIns.length, index + 1);
    }
    assert.equal(alerts.length, 0);
    const cancelledLogin = hooks
      .render(LoginScreen)
      .find((node) => node.type === "SocialLoginButton")
      .props.onPress();
    await new Promise(setImmediate);
    assert.equal(sheet().props.isAnimated, true, "평소에는 시트가 올라오고 내려간다");
    sheet().props.onOpenDocument("terms");
    assert.equal(routes.at(-1), "/policies/terms");
    assert.equal(sheet().props.visible, false, "약관 전문을 열면 시트를 닫는다");
    assert.equal(
      sheet().props.isAnimated,
      false,
      "BUG-145 전문을 오갈 때는 시트를 움직이지 않는다",
    );
    sheet().props.onClose();
    await cancelledLogin;
    assert.equal(
      signIns.length,
      expectedProviders.split(",").length + 1,
      "계정 선택 이후 약관을 닫으면 해당 로그인을 취소한다",
    );
    const consented = hooks.render(LoginScreen);
    consented
      .find((node) => node.type === "Pressable" && node.props.accessibilityRole === "button")
      .props.onPress();
    assert.equal(routes.at(-1), "/browse");
    assert.equal(alerts.length, 0);
    hooks.reset();
    loginToasts.length = 0;
    const errorTree = hooks.render(() => LoginScreen({ isLoginError: true }));
    assert.deepEqual(loginToasts.at(-1), {
      message: "로그인에 실패했습니다. 다시 시도해 주세요.",
      variant: "error",
    });
    assert.equal(errorTree.find((node) => node.type === "AppBar").props.left, "none");
    assert.equal(
      errorTree.filter((node) => node.type === "SocialLoginButton").length,
      os === "ios" ? 3 : 2,
    );
    assert.equal(
      errorTree.some((node) => node.type === "ToastText"),
      false,
    );
    hooks.reset();
    const loadingTree = hooks.render(() => LoginScreen({ isLoginLoading: true }));
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
    const hooks = stateHooks();
    const { LoginScreen } = load("screens/login/LoginScreen.tsx", {
      "react": {
        useState: hooks.useState,
        useRef: hooks.useRef,
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
      "@/components/modal": { ActionModal: "ActionModal" },
      "@/components/UnderageNoticeModal": { UnderageNoticeModal: "UnderageNoticeModal" },
      "@/components/ToastText": { ToastText: "ToastText" },
      "./components/SocialLoginButton": { SocialLoginButton: "SocialLoginButton" },
      "@/contexts/AuthContext": { useAuth: () => ({ session: null }) },
    });
    const press = () => pressSocialAfterConsent(hooks, LoginScreen);
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
      "@/components/modal": { ActionModal: "ActionModal" },
      "@/components/UnderageNoticeModal": { UnderageNoticeModal: "UnderageNoticeModal" },
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
  const run = async (session, pathname, appState = "active") => {
    const started = [];
    let taken = 0;
    const effects = [];
    const listeners = [];
    const { default: TabLayout } = load("app/(tabs)/_layout.tsx", {
      "react": { useEffect: (effect) => effects.push(effect) },
      "react-native": {
        AppState: {
          currentState: appState,
          addEventListener: (_type, listener) => {
            listeners.push(listener);
            return { remove() {} };
          },
        },
      },
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
    const becomeActive = async () => {
      listeners.forEach((listener) => listener("active"));
      await new Promise((resolve) => setImmediate(resolve));
    };
    return { started, taken, becomeActive };
  };
  const guest = await run(null, "/all");
  assert.deepEqual([guest.started, guest.taken], [[], 0], "둘러보기 비회원은 꺼내지 않는다");
  const folder = await run({ user: { id: "u" } }, "/folder");
  assert.deepEqual([folder.started, folder.taken], [[], 0]);
  const member = await run({ user: { id: "u" } }, "/all");
  assert.deepEqual([member.started, member.taken], [["https://www.musinsa.com/products/1"], 1]);

  const afterLogin = await run({ user: { id: "u" } }, "/all", "inactive");
  assert.equal(afterLogin.taken, 0, "로그인 창이 닫히는 중에는 꺼내지 않는다");
  await afterLogin.becomeActive();
  assert.deepEqual(afterLogin.started, ["https://www.musinsa.com/products/1"]);
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
  const analyticsUsers = [];
  let onAppState;
  let googleSignOutFails = false;
  let sessionChecks = 0;
  const supabase = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { id: "s", user: { id: "u1" } } } }),
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
    "@react-native-google-signin/google-signin": {
      GoogleSignin: {
        configure() {
          order.push("configureGoogle");
        },
        async signOut() {
          order.push("signOutGoogle");
          if (googleSignOutFails) throw new Error("google_signout_failed");
        },
      },
    },
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
    "@/lib/sessionCheck": { checkSession: () => sessionChecks++ },
    "@/lib/analytics": { syncAnalyticsConsent: async (userId) => analyticsUsers.push(userId) },
    "react-native": {
      AppState: {
        addEventListener: (_event, listener) => {
          onAppState = listener;
          return { remove() {} };
        },
      },
    },
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
  render();
  await Promise.resolve();
  assert.ok(sessionChecks > 0, "저장된 세션을 복원하면 서버에서 끊긴 세션인지 확인한다");
  await render().signOut();
  assert.equal(signOutOptions.length, 1);
  assert.equal(signOutOptions[0].scope, "local", "이 기기 세션만 끊는다");
  assert.deepEqual(
    order,
    ["configureGoogle", "unregisterPush", "signOutGoogle", "signOut", "finishPush"],
    "SDK 초기화 후 Push·Google 로그인 상태를 비우고 앱 세션을 끊는다",
  );
  assert.equal(render().isSessionExpired, false);
  order.length = 0;
  emit("TOKEN_REFRESHED", { id: "s2", user: { id: "u2" } });
  assert.equal(render().isSessionExpired, false);
  assert.deepEqual(order, [], "세션 갱신 시 Google 상태를 해제하지 않는다");
  emit("SIGNED_OUT", null);
  await Promise.resolve();
  assert.deepEqual(order, ["signOutGoogle"], "세션 만료 시에도 Google 상태를 해제한다");
  assert.equal(render().isSessionExpired, true);
  assert.equal(cacheClears.length, 2, "로그아웃·만료 모두 상품 캐시를 비운다");
  assert.deepEqual(
    analyticsUsers,
    [null, "u2", null],
    "로그인하면 회원의 분석 동의를 확인하고 로그아웃·만료하면 끈다",
  );
  const checksBeforeActive = sessionChecks;
  onAppState("active");
  assert.equal(
    analyticsUsers.at(-1),
    "u1",
    "앱으로 돌아오면 현재 세션의 회원 동의를 다시 확인한다",
  );
  assert.equal(sessionChecks - checksBeforeActive, 1, "앱으로 돌아오면 세션도 다시 확인한다");
  render().confirmSessionExpired();
  assert.equal(render().isSessionExpired, false);
  googleSignOutFails = true;
  order.length = 0;
  await render().signOut();
  assert.deepEqual(order, ["unregisterPush", "signOutGoogle", "signOut", "finishPush"]);
  assert.equal(signOutOptions.length, 2, "Google SDK 오류가 앱 로그아웃을 막지 않는다");
  assert.equal(render().isSessionExpired, false);
  order.length = 0;
  emit("SIGNED_OUT", null);
  await Promise.resolve();
  assert.deepEqual(order, ["signOutGoogle"], "이전 세션 정보가 없어도 Google 상태를 해제한다");
  assert.equal(render().isSessionExpired, true, "Google SDK 오류가 세션 만료 안내를 막지 않는다");
});

function loadSignIn({
  getUser,
  kakao = {},
  saveAvatar = async () => {},
  authError = null,
  restrictionNotice = null,
  os = "ios",
  apple = {},
  invoked = [],
  claimSignup = async () => true,
  policyStatus = {
    requires_consent: false,
    is_new_user: true,
    terms_policy_id: 1,
    privacy_policy_id: 2,
    terms_version: "1.1",
    privacy_version: "1.1",
  },
  completeConsent = async () => ({ data: null, error: null }),
  lookupError = null,
  authCalls = [],
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
    "expo-apple-authentication": apple,
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
        rpc: async (name, args) => {
          if (name === "complete_login_consent") return completeConsent(args);
          assert.equal(name, "claim_signup_completion");
          return { data: await claimSignup(), error: null };
        },
        functions: {
          invoke: async (name, input) => {
            invoked.push([name, input.body]);
            if (name === "apple-token") return { data: null, error: new Error("offline") };
            assert.equal(name, "account-restriction");
            if (input.body.operation === "login-consent")
              return {
                data: {
                  policy_status: policyStatus,
                  notice: authError?.code === "user_banned" ? restrictionNotice : null,
                },
                error: lookupError,
              };
            assert.equal(input.body.provider, "google");
            assert.equal(input.body.id_token, "token");
            return { data: { notice: restrictionNotice }, error: null };
          },
        },
        auth: {
          signInWithIdToken: async () => {
            authCalls.push("authenticate");
            return { error: authError };
          },
          signOut: async () => ({ error: null }),
          getUser: async () => ({ data: { user: getUser() }, error: null }),
        },
      },
    },
  });
}

test("소셜 계정 확인 뒤 신규·재동의 계정만 동의를 받고, 취소하면 계정을 생성하지 않는다", async () => {
  const policyStatus = {
    requires_consent: true,
    is_new_user: true,
    terms_policy_id: 1,
    privacy_policy_id: 2,
    terms_version: "1.1",
    privacy_version: "1.1",
  };
  for (const provider of ["google", "kakao", "apple"]) {
    const authCalls = [];
    const saved = [];
    const { signIn } = loadSignIn({
      getUser: () => ({ id: "new-member" }),
      policyStatus,
      authCalls,
      apple: { signInAsync: async () => ({ identityToken: "apple-id" }) },
      completeConsent: async (args) => {
        saved.push(args);
        return { error: null };
      },
    });
    let resolveConsent;
    const pending = signIn(
      provider,
      () => {},
      () =>
        new Promise((resolve) => {
          resolveConsent = resolve;
        }),
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(typeof resolveConsent, "function");
    assert.deepEqual(authCalls, [], "동의 전에는 Supabase 인증·가입을 시작하지 않는다");
    resolveConsent(null);
    assert.equal((await pending).status, "cancelled");
    assert.deepEqual(authCalls, []);
    assert.deepEqual(saved, []);
    assert.equal(
      (
        await signIn(
          provider,
          () => {},
          async () => ALL_AGREED,
        )
      ).status,
      "success",
    );
    assert.deepEqual(authCalls, ["authenticate"]);
    assert.deepEqual(JSON.parse(JSON.stringify(saved)), [
      { terms_policy_id: 1, privacy_policy_id: 2, age_confirmed: true },
    ]);
  }
});

test("동의 이력이 있는 계정은 시트 없이 로그인하며 신규 동의를 덧쓰지 않는다", async () => {
  let completed;
  const { signIn } = loadSignIn({
    getUser: () => ({ id: "existing-member" }),
    // 구버전 앱이 가입 완료 선점 RPC를 호출하지 않았더라도 기존 계정이다.
    claimSignup: async () => true,
    policyStatus: {
      requires_consent: false,
      is_new_user: false,
      terms_policy_id: 1,
      privacy_policy_id: 2,
      terms_version: "1.1",
      privacy_version: "1.1",
    },
    completeConsent: async (args) => {
      completed = args;
      return { error: null };
    },
  });
  const result = await signIn(
    "google",
    () => {},
    () => assert.fail("동의 시트를 표시하면 안 됨"),
  );
  assert.equal(result.isNewUser, false);
  assert.equal(completed.age_confirmed, false, "새 동의를 만들어 저장하지 않는다");
});

test("구버전 가입 계정이 처음 필수 동의를 저장해도 신규 가입 안내를 재생하지 않는다", async () => {
  const { signIn } = loadSignIn({
    getUser: () => ({ id: "old-client-member" }),
    claimSignup: async () => true,
    policyStatus: {
      requires_consent: true,
      is_new_user: false,
      terms_policy_id: 1,
      privacy_policy_id: 2,
      terms_version: "1.1",
      privacy_version: "1.1",
    },
  });
  const result = await signIn(
    "google",
    () => {},
    async () => ALL_AGREED,
  );
  assert.equal(result.status, "success");
  assert.equal(result.isNewUser, false);
});

test("동의 조회 실패·잘못된 응답·미지원 재동의 버전에서는 가입을 진행하지 않는다", async () => {
  for (const options of [
    { lookupError: new Error("offline") },
    { policyStatus: {} },
    {
      policyStatus: {
        requires_consent: true,
        is_new_user: true,
        terms_policy_id: 1,
        privacy_policy_id: 2,
        terms_version: "2.0",
        privacy_version: "1.1",
      },
    },
  ]) {
    const authCalls = [];
    const { signIn } = loadSignIn({ getUser: () => ({ id: "u" }), authCalls, ...options });
    await assert.rejects(
      signIn(
        "google",
        () => {},
        () => assert.fail("확인할 수 없는 약관을 표시하면 안 됨"),
      ),
    );
    assert.deepEqual(authCalls, []);
  }
});

test("필수 동의를 빠뜨리면 가입하지 않고, 저장 중 버전 변경은 중간 세션을 정리한다", async () => {
  const policyStatus = {
    requires_consent: true,
    is_new_user: true,
    terms_policy_id: 1,
    privacy_policy_id: 2,
    terms_version: "1.1",
    privacy_version: "1.1",
  };
  const authCalls = [];
  const rolledBack = [];
  let claims = 0;
  const { signIn } = loadSignIn({
    getUser: () => ({ id: "u" }),
    policyStatus,
    authCalls,
    claimSignup: async () => {
      claims++;
      return true;
    },
    completeConsent: async () => ({ error: new Error("login_policies_changed") }),
  });
  await assert.rejects(
    signIn(
      "google",
      () => {},
      async () => ({ ...ALL_AGREED, age: false }),
    ),
    /login_consent_required/,
  );
  assert.deepEqual(authCalls, []);
  await assert.rejects(
    signIn(
      "google",
      () => {},
      async () => ALL_AGREED,
      async () => {
        rolledBack.push(true);
      },
    ),
    /login_policies_changed/,
  );
  assert.deepEqual(rolledBack, [true]);
  assert.equal(claims, 0, "동의 저장에 실패하면 가입 안내를 선점하지 않는다");
});

test("가입 1분 안에 다시 로그인해도 가입 완료 안내는 사용자별로 한 번만 보여 준다", async () => {
  let user;
  const { signIn } = loadSignIn({ getUser: () => user, claimSignup: async () => user.id !== "c" });
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

test("기기에 기록이 없는 기존 회원도 서버에서 가입 안내를 처리했다면 재노출하지 않는다", async () => {
  for (const provider of ["google", "kakao", "apple"]) {
    for (const lastSignInAt of ["2026-10-16T00:00:00Z", null, "invalid"]) {
      const { signIn } = loadSignIn({
        getUser: () => ({
          id: "existing",
          created_at: "2026-10-16T00:00:00Z",
          last_sign_in_at: lastSignInAt,
        }),
        claimSignup: async () => false,
        apple: { signInAsync: async () => ({ identityToken: "apple-token" }) },
      });
      assert.equal((await signIn(provider)).isNewUser, false, `${provider}/${lastSignInAt}`);
    }
  }
});

test("최초 가입 안내는 새 기기에서도 서버 선점 결과를 따르고 실패하면 기존 회원 경로로 진행한다", async () => {
  const user = { id: "member" };
  let pending = true;
  const claimSignup = async () => {
    const claimed = pending;
    pending = false;
    return claimed;
  };
  const first = loadSignIn({ getUser: () => user, claimSignup });
  assert.equal((await first.signIn("google")).isNewUser, true);
  const otherDevice = loadSignIn({ getUser: () => user, claimSignup });
  assert.equal((await otherDevice.signIn("google")).isNewUser, false);
  const unavailable = loadSignIn({
    getUser: () => user,
    claimSignup: async () => {
      throw new Error("network_error");
    },
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = await unavailable.signIn("google");
    assert.equal(result.status, "success");
    assert.equal(result.isNewUser, false);
  } finally {
    console.warn = warn;
  }
});

test("카카오 신규 가입만 카카오 프로필 사진을 복사하고, 실패해도 로그인은 이어 간다", async () => {
  const signedUpAt = "2026-10-16T00:00:00Z";
  let user = { id: "k1", created_at: signedUpAt, last_sign_in_at: signedUpAt };
  const saved = [];
  let photoUrl = "https://k.kakaocdn.net/photo.jpg";
  const { signIn } = loadSignIn({
    getUser: () => user,
    claimSignup: async () => user.id !== "k2",
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

test("로딩 창은 소셜 로그인 창이 닫히고 토큰을 받은 뒤에만 띄운다", async () => {
  const order = [];
  const user = {
    id: "a",
    created_at: "2026-10-16T00:00:00Z",
    last_sign_in_at: "2026-10-16T00:05:00Z",
  };
  const { signIn } = loadSignIn({
    getUser: () => (order.push("server"), user),
    kakao: {
      login: async () => {
        throw Object.assign(new Error("cancel"), { code: "Cancelled" });
      },
    },
  });
  assert.equal((await signIn("google", () => order.push("loading"))).status, "success");
  assert.deepEqual(order, ["loading", "server"]);
  order.length = 0;
  assert.equal((await signIn("kakao", () => order.push("loading"))).status, "cancelled");
  assert.deepEqual(order, [], "취소하면 로딩 창을 띄우지 않는다");
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

test("애플 로그인에 성공하면 인증 코드를 서버에 맡기고, 맡기지 못해도 로그인은 이어 간다", async () => {
  const invoked = [];
  const now = new Date().toISOString();
  const { signIn } = loadSignIn({
    getUser: () => ({ id: "apple-user", created_at: now, last_sign_in_at: now }),
    apple: {
      signInAsync: async () => ({
        identityToken: "apple-id-token",
        authorizationCode: "apple-code",
      }),
    },
    invoked,
  });
  const result = await signIn("apple", () => {});
  assert.equal(result.status, "success");
  assert.deepEqual(JSON.parse(JSON.stringify(invoked.filter(([name]) => name === "apple-token"))), [
    ["apple-token", { authorization_code: "apple-code" }],
  ]);
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
    const hooks = stateHooks();
    const { LoginScreen } = load("screens/login/LoginScreen.tsx", {
      "react": {
        useState: hooks.useState,
        useRef: hooks.useRef,
        useEffect: (effect) => {
          cleanup = effect();
        },
      },
      "./api/signIn": {
        signIn: async (_provider, _authorized, requestConsent) => {
          if (result.isNewUser && !(await requestConsent())) return { status: "cancelled" };
          return result;
        },
      },
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
      "@/components/modal": { ActionModal: "ActionModal" },
      "@/components/UnderageNoticeModal": { UnderageNoticeModal: "UnderageNoticeModal" },
      "@/components/ToastText": { ToastText: "ToastText" },
      "./components/SocialLoginButton": { SocialLoginButton: "SocialLoginButton" },
    });
    const press = () => pressSocialAfterConsent(hooks, LoginScreen);
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
  loginConsents.length = 0;
  analyticsEvents.length = 0;
  await newbie.press();
  newbie.unmount();
  assert.deepEqual(
    JSON.parse(JSON.stringify(loginConsents)),
    [[true, { usage_analysis: true, overseas_transfer: true }]],
    "시트에서 체크한 선택 동의를 신규 회원으로 저장한다",
  );
  assert.equal(
    analyticsEvents[0]?.[0],
    "signup_complete",
    "동의를 저장한 뒤 가입 완료 이벤트를 보낸다",
  );
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

test("만 14세 미만으로 이용 중단된 계정이 로그인하면 이용 중단 안내를 띄운다", async () => {
  const hooks = stateHooks();
  const { LoginScreen } = load("screens/login/LoginScreen.tsx", {
    "react": { useState: hooks.useState, useRef: hooks.useRef, useEffect: () => {} },
    "./api/signIn": {
      signIn: async () => ({
        status: "suspended",
        access: { status: "suspended", reasonCategory: "underage" },
      }),
    },
    "@/contexts/AuthContext": { useAuth: () => ({ session: null }) },
    "@/lib/pendingShareLink": { discardShareLink: () => {} },
    "expo-router": {
      useRouter: () => ({
        replace: () => {},
        back: () => {},
        canGoBack: () => false,
        push: () => {},
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
    },
    "@/components/app-bar": { AppBar: "AppBar" },
    "@/components/LoadingDialog": { LoadingDialog: "LoadingDialog" },
    "@/components/ToastText": { ToastText: "ToastText" },
    "@/components/modal": { ActionModal: "ActionModal" },
    "@/components/UnderageNoticeModal": { UnderageNoticeModal: "UnderageNoticeModal" },
    "./components/SocialLoginButton": { SocialLoginButton: "SocialLoginButton" },
  });
  await pressSocialAfterConsent(hooks, LoginScreen);
  const tree = hooks.render(LoginScreen);
  assert.ok(tree.some((node) => node.type === "UnderageNoticeModal"));
  assert.ok(!tree.some((node) => node.type === "SanctionNoticeModal"));
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

test("권한 오류(42501)가 나면 세션을 확인하고, 동시에 여러 번 나도 확인은 한 번만 보낸다", async () => {
  const responses = [];
  let currentToken = "token-a";
  const signOuts = [];
  const { checkSession } = load("lib/sessionCheck.ts", {
    "globals": {
      fetch: (url, options) =>
        new Promise((resolve) => responses.push({ token: options.headers.Authorization, resolve })),
    },
    "@/lib/supabase": {
      supabase: {
        auth: {
          getSession: async () => ({
            data: { session: currentToken ? { access_token: currentToken } : null },
          }),
          signOut: async (options) => signOuts.push(options),
        },
      },
    },
  });
  const sessionGone = { ok: false, status: 403, json: async () => ({ code: "session_not_found" }) };
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  const first = checkSession();
  checkSession();
  await flush();
  assert.equal(responses.length, 1, "확인 중이면 같은 요청을 기다린다");
  responses[0].resolve({ ok: true, status: 200 });
  await first;
  checkSession();
  await flush();
  assert.equal(responses.length, 2, "끝난 뒤에는 다시 확인할 수 있다");
  responses[1].resolve({ ok: false, status: 503, json: async () => ({}) });
  await flush();
  assert.equal(signOuts.length, 0, "서버 오류는 세션을 유지한다");

  // A 확인 중 B로 바뀌면 늦게 온 A의 만료 응답이 B를 로그아웃시키지 않는다.
  const stale = checkSession();
  await flush();
  currentToken = "token-b";
  const fresh = checkSession();
  await flush();
  assert.equal(responses.length, 4, "계정이 바뀌면 새 토큰으로 따로 확인한다");
  responses[2].resolve(sessionGone);
  await stale;
  assert.equal(signOuts.length, 0, "이전 계정의 응답은 새 계정을 로그아웃시키지 않는다");
  responses[3].resolve(sessionGone);
  await fresh;
  assert.equal(signOuts.length, 1, "현재 계정의 세션이 끊겼으면 로그아웃한다");
  assert.equal(signOuts[0].scope, "local");

  const handlers = [];
  const checks = [];
  class Cache {
    constructor(options) {
      handlers.push(options.onError);
    }
  }
  load("lib/queryClient.ts", {
    "@tanstack/react-query": { QueryCache: Cache, MutationCache: Cache, QueryClient: class {} },
    "@/lib/sessionCheck": { checkSession: () => checks.push(true) },
  });
  for (const onError of handlers) {
    onError({ code: "42501", message: "not_authorized" });
    onError({ code: "PGRST116" });
    onError(new Error("offline"));
  }
  assert.equal(checks.length, 2, "조회·변경 모두 권한 오류에서만 세션을 확인한다");
});
