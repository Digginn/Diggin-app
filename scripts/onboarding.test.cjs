/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

test("공통 캐러셀이 Figma의 296px 간격으로 스와이프·점 선택·접근성 이동을 처리한다", () => {
  let activeIndex = 0;
  const scrollCalls = [];
  const pageChanges = [];
  const source = readFileSync(
    path.join(__dirname, "../src/components/carousel/SwipeCarousel.tsx"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const componentModule = { exports: {} };
  runInNewContext(compiled, {
    exports: componentModule.exports,
    module: componentModule,
    require: (name) => {
      if (name === "react") {
        return {
          Children: React.Children,
          isValidElement: React.isValidElement,
          useState: (initial) =>
            initial === false ? [false, () => {}] : [activeIndex, (index) => (activeIndex = index)],
          useCallback: (callback) => callback,
          useEffect: () => {},
          useRef: () => ({ current: { scrollTo: (options) => scrollCalls.push(options) } }),
        };
      }
      if (name === "react-native") {
        return {
          Pressable: "Pressable",
          ScrollView: "ScrollView",
          Text: "Text",
          View: "View",
        };
      }
      if (name === "react-native-reanimated") return { useReducedMotion: () => false };
      if (name === "./BtnCarousel") return { BtnCarousel: "BtnCarousel" };
      return require(name);
    },
  });
  function render() {
    const root = componentModule.exports.SwipeCarousel({
      children: ["1", "2", "3"].map((key) => React.createElement("CardCarousel", { key })),
      accessibilityLabel: "서비스 소개",
      onPageChange: (index) => pageChanges.push(index),
    });
    const [scroll, indicators] = React.Children.toArray(root.props.children);
    return { root, scroll, dots: React.Children.toArray(indicators.props.children) };
  }
  let tree = render();
  assert.ok(tree.root.props.className.includes("w-[295px]"));
  assert.ok(tree.root.props.className.includes("h-[584px]"));
  assert.equal(Array.from(tree.scroll.props.snapToOffsets).join(","), "0,296,592");
  assert.equal(React.Children.count(tree.scroll.props.children), 3);
  assert.equal(tree.dots[0].props.isActive, true);
  tree.scroll.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 296 } } });
  assert.equal(pageChanges.at(-1), 1);
  tree = render();
  assert.equal(tree.dots[1].props.isActive, true);
  tree.dots[2].props.onPress();
  assert.equal(activeIndex, 2);
  assert.equal(pageChanges.at(-1), 2);
  assert.equal(scrollCalls.at(-1).x, 592);
  tree = render();
  tree.scroll.props.onAccessibilityAction({ nativeEvent: { actionName: "increment" } });
  assert.equal(activeIndex, 2);
  tree.scroll.props.onAccessibilityAction({ nativeEvent: { actionName: "decrement" } });
  assert.equal(activeIndex, 1);
  tree = render();
  tree.scroll.props.onLayout();
  assert.equal(scrollCalls.at(-1).x, 296);
  tree.scroll.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: -296 } } });
  assert.equal(activeIndex, 0);
  tree.scroll.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 9999 } } });
  assert.equal(activeIndex, 2);
  assert.equal(componentModule.exports.SwipeCarousel({ children: null }), null);
});

test("자동 전환은 마지막에서 멈추고 스와이프·모션 줄이기 시에는 쉬어간다", () => {
  const source = readFileSync(
    path.join(__dirname, "../src/components/carousel/SwipeCarousel.tsx"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const componentModule = { exports: {} };
  const state = [0, false];
  const timers = new Map();
  const scrollCalls = [];
  let hookIndex = 0;
  let effect;
  let cleanup;
  let isReducedMotion = false;
  runInNewContext(compiled, {
    exports: componentModule.exports,
    module: componentModule,
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timers.set(timer, timer);
      return timer;
    },
    clearTimeout: (timer) => timers.delete(timer),
    require: (name) => {
      if (name === "react")
        return {
          Children: React.Children,
          isValidElement: React.isValidElement,
          useCallback: (callback) => callback,
          useEffect: (callback) => {
            effect = callback;
          },
          useRef: () => ({ current: { scrollTo: (options) => scrollCalls.push(options) } }),
          useState: () => {
            const slot = hookIndex++;
            return [
              state[slot],
              (value) => {
                state[slot] = value;
              },
            ];
          },
        };
      if (name === "react-native") return { View: "View", ScrollView: "ScrollView" };
      if (name === "react-native-reanimated") return { useReducedMotion: () => isReducedMotion };
      if (name === "./BtnCarousel") return { BtnCarousel: "BtnCarousel" };
      return require(name);
    },
  });
  function render(autoAdvanceDelays = [2500, 2500]) {
    cleanup?.();
    hookIndex = 0;
    const root = componentModule.exports.SwipeCarousel({
      children: ["1", "2", "3"].map((key) => React.createElement("CardCarousel", { key })),
      autoAdvanceDelays,
    });
    cleanup = effect();
    return React.Children.toArray(root.props.children)[0];
  }
  render();
  assert.equal(timers.values().next().value.delay, 2500);
  timers.values().next().value.callback();
  assert.equal(state[0], 1);
  assert.equal(scrollCalls.at(-1).x, 296);
  render();
  assert.equal(timers.values().next().value.delay, 2500);
  timers.values().next().value.callback();
  assert.equal(state[0], 2);
  assert.equal(scrollCalls.at(-1).x, 592);
  render();
  assert.equal(timers.size, 0);

  state[0] = 0;
  render().props.onScrollBeginDrag();
  render();
  assert.equal(timers.size, 0);
  render().props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 296 } } });
  render();
  assert.equal(timers.values().next().value.delay, 2500);

  isReducedMotion = true;
  render();
  assert.equal(timers.size, 0);
  isReducedMotion = false;
  render([]);
  assert.equal(timers.size, 0);
  render();
  cleanup();
  assert.equal(timers.size, 0);
});

test("카드 문구·이미지를 사용처에서 받고, 페이지 버튼의 터치 영역은 겹치지 않는다", () => {
  function load(name) {
    const source = readFileSync(
      path.join(__dirname, `../src/components/carousel/${name}.tsx`),
      "utf8",
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const componentModule = { exports: {} };
    runInNewContext(compiled, {
      exports: componentModule.exports,
      module: componentModule,
      require: (moduleName) => {
        if (moduleName === "react-native")
          return { View: "View", Text: "Text", Pressable: "Pressable" };
        if (moduleName.endsWith(".svg")) return { default: moduleName };
        return require(moduleName);
      },
    });
    return componentModule.exports;
  }
  const { CardCarousel, EmptyCarousel } = load("CardCarousel");
  const image = React.createElement("Image");
  const props = { mainCopy: "제목", subCopy: "설명", children: image };
  const card = CardCarousel(props);
  assert.ok(card.props.className.includes("w-[296px]"));
  assert.ok(card.props.className.includes("h-[600px]"));
  const content = EmptyCarousel(card.props.children.props);
  const [imageSlot, textWrap] = React.Children.toArray(content.props.children);
  assert.ok(imageSlot.props.className.includes("h-[396px]"));
  assert.equal(imageSlot.props.children, image);
  const copy = React.Children.toArray(textWrap.props.children);
  assert.equal(copy[0].props.children, props.mainCopy);
  assert.equal(copy[1].props.children, props.subCopy);
  const { BtnCarousel } = load("BtnCarousel");
  const onPress = () => {};
  const dot = BtnCarousel({ isActive: true, onPress, accessibilityLabel: "1페이지" });
  assert.equal(dot.props.onPress, onPress);
  assert.equal(dot.props.accessibilityState.selected, true);
  assert.equal(dot.props.hitSlop, undefined);
  assert.ok(dot.props.className.includes("h-12 w-4"));
});

test("마지막 온보딩 장에만 시작하기 버튼을 표시하고 로그인으로 이동한다", () => {
  let activeIndex = 0;
  const routes = [];
  const source = readFileSync(
    path.join(__dirname, "../src/screens/onboarding/OnboardingScreen.tsx"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const componentModule = { exports: {} };
  runInNewContext(compiled, {
    exports: componentModule.exports,
    module: componentModule,
    require: (name) => {
      if (name === "react")
        return { useState: () => [activeIndex, (index) => (activeIndex = index)] };
      if (name === "expo-router")
        return { useRouter: () => ({ replace: (route) => routes.push(route) }) };
      if (name === "expo-status-bar") return { StatusBar: "StatusBar" };
      if (name === "react-native-safe-area-context")
        return { useSafeAreaInsets: () => ({ top: 50, bottom: 34 }) };
      if (name === "react-native")
        return {
          ScrollView: "ScrollView",
          View: "View",
          useWindowDimensions: () => ({ height: 812 }),
        };
      if (name === "@/components/Button") return { Button: "Button" };
      if (name === "@/components/carousel")
        return { CardCarousel: "CardCarousel", SwipeCarousel: "SwipeCarousel" };
      if (name === "@/theme") return { baseFrame: { height: 812 } };
      return require(name);
    },
  });

  function render() {
    const root = componentModule.exports.OnboardingScreen();
    const scroll = React.Children.toArray(root.props.children)[1];
    return React.Children.toArray(scroll.props.children);
  }

  const firstPage = render();
  assert.equal(firstPage.length, 1);
  assert.equal(Array.from(firstPage[0].props.autoAdvanceDelays).join(","), "2500,2500");
  for (const card of React.Children.toArray(firstPage[0].props.children)) {
    assert.ok(
      !card.props.children.props.className.includes("left-px"),
      "슬라이드 이미지를 오른쪽으로 밀면 페이지 경계에 흰 틈이 생깁니다.",
    );
  }
  firstPage[0].props.onPageChange(2);
  const lastPage = render();
  assert.equal(lastPage.length, 2);
  const button = lastPage[1].props.children;
  assert.equal(button.props.children, "시작하기");
  button.props.onPress();
  assert.equal(routes.at(-1), "/login");
});

test("둘러보기 안내와 가입 완료 화면은 같은 아트워크를 쓰고 각 버튼이 올바르게 이동한다", () => {
  const routes = [];
  const source = readFileSync(
    path.join(__dirname, "../src/screens/onboarding/OnboardingFinishScreen.tsx"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const componentModule = { exports: {} };
  runInNewContext(compiled, {
    exports: componentModule.exports,
    module: componentModule,
    require: (name) => {
      if (name === "expo-router")
        return { useRouter: () => ({ replace: (route) => routes.push(route) }) };
      if (name === "expo-status-bar") return { StatusBar: "StatusBar" };
      if (name === "react-native-safe-area-context")
        return { useSafeAreaInsets: () => ({ top: 50, bottom: 34 }) };
      if (name === "react-native")
        return {
          Image: "Image",
          Pressable: "Pressable",
          ScrollView: "ScrollView",
          Text: "Text",
          View: "View",
          useWindowDimensions: () => ({ height: 812 }),
        };
      if (name === "@/components/Button") return { Button: "Button" };
      return require(name);
    },
  });
  const { OnboardingFinishScreen } = componentModule.exports;
  function descendants(root) {
    const result = [];
    function visit(node) {
      if (!React.isValidElement(node)) return;
      result.push(node);
      React.Children.forEach(node.props.children, visit);
    }
    visit(root);
    return result;
  }

  const guest = descendants(OnboardingFinishScreen({ mode: "guest" }));
  assert.ok(
    guest.some(
      (node) => node.type === "Text" && node.props.children === "마음껏 Diggin을\n둘러보세요.",
    ),
  );
  const guestButton = guest.find((node) => node.type === "Button");
  assert.equal(guestButton.props.children, "둘러보기");
  guestButton.props.onPress();
  assert.equal(routes.at(-1), "/(tabs)/all");
  guest.find((node) => node.type === "Pressable").props.onPress();
  assert.equal(routes.at(-1), "/login");

  const complete = descendants(OnboardingFinishScreen({ mode: "signed-up" }));
  assert.ok(
    complete.some(
      (node) =>
        node.type === "Text" && node.props.children === "Diggin을 사용할\n준비가 완료되었어요.",
    ),
  );
  assert.equal(complete.find((node) => node.type === "Button").props.children, "시작하기");
  assert.equal(complete.filter((node) => node.type === "Pressable").length, 0);
  complete.find((node) => node.type === "Button").props.onPress();
  assert.equal(routes.at(-1), "/(tabs)/all");
});

test("가입 완료 시 iOS 최초 1회에만 시스템 알림 권한을 요청한다", async () => {
  const source = readFileSync(path.join(__dirname, "../src/app/signup-complete.tsx"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const componentModule = { exports: {} };
  const platform = { OS: "ios" };
  let permissionStatus = "notDetermined";
  let checks = 0;
  let requests = 0;
  runInNewContext(compiled, {
    exports: componentModule.exports,
    module: componentModule,
    console,
    require: (name) => {
      if (name === "react") return { useEffect: (effect) => effect() };
      if (name === "react-native") return { Platform: platform };
      if (name === "expo-notifications")
        return {
          IosAuthorizationStatus: { NOT_DETERMINED: "notDetermined" },
          getPermissionsAsync: async () => {
            checks += 1;
            return { ios: { status: permissionStatus } };
          },
          requestPermissionsAsync: async () => {
            requests += 1;
          },
        };
      if (name === "@/screens/onboarding/OnboardingFinishScreen")
        return { OnboardingFinishScreen: "OnboardingFinishScreen" };
      return require(name);
    },
  });

  const { default: SignupCompleteScreen } = componentModule.exports;
  assert.equal(SignupCompleteScreen().props.mode, "signed-up");
  await new Promise(setImmediate);
  assert.equal(checks, 1);
  assert.equal(requests, 1);

  permissionStatus = "denied";
  SignupCompleteScreen();
  await new Promise(setImmediate);
  assert.equal(checks, 2);
  assert.equal(requests, 1);

  platform.OS = "android";
  SignupCompleteScreen();
  await new Promise(setImmediate);
  assert.equal(checks, 2);
  assert.equal(requests, 1);
});
