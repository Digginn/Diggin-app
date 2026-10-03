/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function load(relativePath, mocks = {}) {
  const source = readFileSync(path.join(__dirname, "../src", relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const componentModule = { exports: {} };
  runInNewContext(compiled, {
    exports: componentModule.exports,
    module: componentModule,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name.endsWith(".svg")) return { __esModule: true, default: name };
      if (name === "react-native") return { View: "View", Text: "Text", Pressable: "Pressable" };
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

test("루트는 폰트 준비 후 스플래시를 닫고 전역 토스트·상태바·라우터를 함께 제공한다", () => {
  let isLoaded = false;
  let fontError = null;
  let effect;
  let hidden = 0;
  let prevented = 0;
  const { default: RootLayout } = load("app/_layout.tsx", {
    "expo-font": { useFonts: () => [isLoaded, fontError] },
    "expo-router": { Stack: "Stack" },
    "expo-status-bar": { StatusBar: "StatusBar" },
    "expo-splash-screen": {
      preventAutoHideAsync: () => {
        prevented += 1;
      },
      hideAsync: () => {
        hidden += 1;
      },
    },
    "react": {
      useEffect: (callback) => {
        effect = callback;
      },
    },
    "@/global.css": {},
    "@/contexts/ToastContext": { ToastProvider: "ToastProvider" },
    "@/assets/fonts/Pretendard-Regular.otf": 1,
    "@/assets/fonts/Pretendard-Medium.otf": 2,
    "@/assets/fonts/Pretendard-SemiBold.otf": 3,
    "@/assets/fonts/Pretendard-Bold.otf": 4,
  });
  assert.equal(prevented, 1);
  assert.equal(RootLayout(), null);
  effect();
  assert.equal(hidden, 0);
  isLoaded = true;
  const root = RootLayout();
  effect();
  assert.equal(hidden, 1);
  assert.equal(root.type, "ToastProvider");
  const children = React.Children.toArray(root.props.children);
  assert.equal(children[0].type, "StatusBar");
  assert.equal(children[0].props.style, "auto");
  assert.equal(children[1].type, "Stack");
  assert.equal(children[1].props.screenOptions.headerShown, false);
  isLoaded = false;
  fontError = new Error("폰트 로딩 실패");
  assert.equal(RootLayout().type, "ToastProvider");
  effect();
  assert.equal(hidden, 2);
});

test("로그인 화면의 둘러보기·뒤로 가기와 미연동 안내가 정상 동작한다", () => {
  const routes = [];
  const alerts = [];
  let canGoBack = false;
  const { LoginScreen } = load("screens/login/LoginScreen.tsx", {
    "expo-router": {
      useRouter: () => ({
        replace: (route) => routes.push(route),
        back: () => routes.push("back"),
        canGoBack: () => canGoBack,
      }),
    },
    "expo-status-bar": { StatusBar: "StatusBar" },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 50, bottom: 34 }) },
    "react-native": {
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
  assert.equal(providers.map((node) => node.props.provider).join(","), "google,kakao,apple");
  for (const button of providers) button.props.onPress();
  assert.equal(alerts.length, 3);
  assert.ok(alerts.every((args) => args[0] === "로그인 연동 준비 중"));
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
  assert.equal(errorTree.filter((node) => node.type === "SocialLoginButton").length, 3);
  assert.ok(errorTree.some((node) => node.props.className?.includes("top-[-54px]")));
  const loadingTree = nodes(LoginScreen({ isLoginLoading: true }));
  const loadingDialog = loadingTree.find((node) => node.type === "LoadingDialog");
  assert.equal(loadingDialog.props.message, "로그인 중입니다.");
  loadingDialog.props.onRequestClose();
  assert.equal(routes.at(-1), "/login");
});

test("토스트는 디자인 토큰을 사용하고 터치 방해 없이 오류를 안내한다", () => {
  const { ToastText } = load("components/ToastText.tsx", {
    "@/assets/images/toast": { IconToastError: "IconToastError" },
  });
  const toast = ToastText({ message: "로그인 실패" });
  assert.equal(toast.props.pointerEvents, "none");
  assert.equal(toast.props.accessibilityRole, "alert");
  assert.equal(toast.props.accessibilityLiveRegion, "polite");
  for (const token of ["border-gray-800", "bg-gray-700", "p-3"]) {
    assert.ok(toast.props.className.includes(token));
  }
  const text = nodes(toast).find((node) => node.type === "Text");
  assert.ok(text.props.className.includes("text-gray-200"));
  assert.ok(text.props.className.includes("font-label-14"));
  assert.equal(text.props.children, "로그인 실패");
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

test("인증 만료 안내의 나중에 버튼은 모달을 닫고 로그인 버튼은 로그인 화면으로 이동한다", () => {
  const { SessionExpiredModal } = load("screens/login/components/SessionExpiredModal.tsx", {
    "@/components/Button": { Button: "Button" },
    "@/components/modal": { Modal: "Modal" },
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
  const buttons = nodes(modal).filter((node) => node.type === "Button");
  assert.equal(modal.props.visible, true);
  assert.equal(modal.props.scrimOpacity, 0.36);
  assert.equal(modal.props.isFullScreen, true);
  assert.deepEqual(
    buttons.map((node) => node.props.children),
    ["다음에 할게요", "로그인하기"],
  );
  buttons[0].props.onPress();
  assert.equal(previewModal().props.visible, false);
  assert.equal(routes.length, 0);
  buttons[1].props.onPress();
  assert.deepEqual(routes, ["/login"]);
});
