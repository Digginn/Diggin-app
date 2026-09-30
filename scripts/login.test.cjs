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
  const { ToastText } = load("components/ToastText.tsx");
  const toast = ToastText({ message: "로그인 실패" });
  assert.equal(toast.props.pointerEvents, "none");
  assert.equal(toast.props.accessibilityRole, "alert");
  assert.equal(toast.props.accessibilityLiveRegion, "polite");
  assert.ok(toast.props.className.includes("border-gray-800 bg-gray-700 p-3"));
  assert.ok(toast.props.children.props.className.includes("text-gray-200 font-label-14"));
  assert.equal(toast.props.children.props.children, "로그인 실패");
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
