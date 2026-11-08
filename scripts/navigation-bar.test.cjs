/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");
const platform = { OS: "android" };

const loaded = { exports: {} };
runInNewContext(
  ts.transpileModule(
    readFileSync(path.join(__dirname, "../src/components/NavigationBar.tsx"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText,
  {
    module: loaded,
    exports: loaded.exports,
    require: (name) => {
      if (name === "react-native")
        return {
          View: "View",
          Platform: platform,
          Text: "Text",
          Pressable: "Pressable",
          StyleSheet: { flatten: (s) => s },
        };
      if (name === "@/assets/images/nav")
        return Object.fromEntries(
          ["All", "Folder", "Diggle", "My"].flatMap((tab) =>
            ["Active", "Inactive"].map((state) => [`Icon${tab}${state}`, `Icon${tab}${state}`]),
          ),
        );
      if (name === "@/theme") return { colors: { gray: { 0: "#FFFFFF", 500: "#9A9A9A" } } };
      return require(name);
    },
  },
);
const { NavigationBar } = loaded.exports;
const routes = ["all", "folder", "diggle", "my"].map((name) => ({ name, key: name }));
const descriptors = Object.fromEntries(routes.map((route) => [route.key, { options: {} }]));
const props = {
  state: { routes, index: 0 },
  descriptors,
  navigation: {},
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

test("Android 네 탭은 하단 안전 여백을 확보하고 iOS는 기존 높이를 유지한다", () => {
  for (const os of ["android", "ios"]) {
    platform.OS = os;
    for (const index of [0, 1, 2, 3]) {
      for (const bottom of [0, 16, 24, 34, 48]) {
        const tree = NavigationBar({
          ...props,
          state: { routes, index },
          insets: { ...props.insets, bottom },
        });
        assert.equal(tree.props.style.paddingBottom, os === "android" ? bottom : 0);
        const buttons = React.Children.toArray(tree.props.children);
        assert.equal(buttons.length, 4);
        assert.deepEqual(
          buttons.map((button) => button.props.accessibilityLabel),
          ["ALL", "FOLDER", "DIGGLE", "MY"],
        );
        assert.ok(buttons.every((button) => button.props.className.includes("h-[80px]")));
      }
    }
  }
});

test("탭 누름 이벤트와 전환 방지 동작을 유지한다", () => {
  for (const defaultPrevented of [false, true]) {
    const events = [],
      destinations = [];
    const tree = NavigationBar({
      ...props,
      navigation: {
        emit: (event) => {
          events.push(event);
          return { defaultPrevented };
        },
        navigate: (name) => destinations.push(name),
      },
    });
    const buttons = React.Children.toArray(tree.props.children);
    buttons[0].props.onPress();
    buttons[1].props.onPress();
    assert.deepEqual(
      events.map((event) => event.type),
      ["tabPress", "tabPress"],
    );
    assert.deepEqual(destinations, defaultPrevented ? [] : ["folder"]);
  }
});

test("선택 모드에서 탭바 숨김을 유지한다", () => {
  assert.equal(
    NavigationBar({
      ...props,
      descriptors: { all: { options: { tabBarStyle: { display: "none" } } } },
    }),
    null,
  );
});
