/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function load(file, mocks) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "..", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        if (name in mocks) return mocks[name];
        if (name === "react/jsx-runtime") return require(name);
        const component = path.basename(name).replace(/\.svg$/, "");
        return { [component]: component };
      },
    },
  );
  return module.exports;
}

function nodes(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}

function setup(params = { id: "1" }) {
  const moreSvg = (props) => React.createElement("MoreSvg", props);
  const state = { thumbnailUrl: "https://shop.test/dark.jpg", backDark: true, moreDark: true };
  const sampled = [];
  const events = [];
  const mocks = {
    "react": {
      useEffect: (effect) => void effect(),
      useRef: () => ({ current: null }),
      useState: (initial) => [initial, () => {}],
    },
    "react-native": {
      View: "View",
      Text: "Text",
      ScrollView: "ScrollView",
      Pressable: "Pressable",
      useWindowDimensions: () => ({ width: 375, height: 874 }),
    },
    "expo-image": { Image: "Image" },
    "expo-linear-gradient": { LinearGradient: "LinearGradient" },
    "expo-router": { useLocalSearchParams: () => params, useRouter: () => ({}) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 59 }) },
    "nativewind": {
      cssInterop: (Icon, config) => {
        if (!config.className.nativeStyleToProp?.color) return Icon;
        return ({ className, ...props }) =>
          Icon({ ...props, color: className === "text-gray-0" ? "#FFFFFF" : "#1E1E1E" });
      },
    },
    "@/assets/images/appbar": {
      IconBack: "BackSvg",
      IconKebab: ({ className, ...props }) =>
        moreSvg({ ...props, color: className === "text-gray-0" ? "#FFFFFF" : "#1E1E1E" }),
    },
    "@/hooks/useFirstVisitGuide": { useFirstVisitGuide: () => ({ isVisible: false }) },
    "@/hooks/useToast": { useToast: () => () => {} },
    "@/hooks/useFolders": { useFolders: () => ({ data: [] }) },
    "@/hooks/useCreateFolder": { useCreateFolder: () => ({}) },
    "@/hooks/useProductCounts": { useProductCounts: () => ({}) },
    "@/hooks/useLinkDetectionPause": { useLinkDetectionPause: () => {} },
    "@/lib/analytics": { trackEvent: (name, properties) => events.push([name, properties]) },
    "@/screens/all/mutations/useDeleteProducts": { useDeleteProducts: () => ({}) },
    "./queries/useProduct": {
      useProduct: () => ({
        isSuccess: true,
        data: { values: { thumbnailUrl: state.thumbnailUrl, brand: "" } },
      }),
    },
    "./queries/useProductFolderIds": { useProductFolderIds: () => ({ data: [] }) },
    "./mutations/useUpdateProduct": { useUpdateProduct: () => ({}) },
    "./mutations/useSaveProductFolders": { useSaveProductFolders: () => ({}) },
    "./hooks/useIsImageDark": {
      useIsImageDark: (url, frame, area) => {
        sampled.push({ url, frame, area });
        return area.x === 0 ? state.backDark : state.moreDark;
      },
    },
  };
  mocks["@/components/app-bar"] = { AppBar: { IconButton: "IconButton" } };
  const { IconButton } = load("src/components/app-bar/IconButton.tsx", mocks);
  const { ItemDetailScreen } = load("src/screens/item-detail/ItemDetailScreen.tsx", mocks);
  return { ItemDetailScreen, IconButton, state, sampled, events };
}

test("상품 상세의 양쪽 48px 터치 영역 밝기를 각각 적용하고 케밥 SVG에 색을 전달한다", () => {
  const { ItemDetailScreen, IconButton, state, sampled } = setup();
  for (const [back, more] of [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ]) {
    state.backDark = back;
    state.moreDark = more;
    state.thumbnailUrl = `https://shop.test/${back}-${more}.jpg`;
    const buttons = nodes(ItemDetailScreen()).filter((node) => node.type === "IconButton");
    const previous = buttons.find((node) => node.props.accessibilityLabel === "뒤로 가기");
    const menu = buttons.find((node) => node.props.accessibilityLabel === "아이템 더보기");
    assert.equal(previous.props.className, back ? "text-gray-0" : "text-gray-900");
    assert.equal(menu.props.className, more ? "text-gray-0" : "text-gray-900");
    const icon = IconButton(menu.props).props.children;
    assert.equal(icon.type(icon.props).props.color, more ? "#FFFFFF" : "#1E1E1E");
    assert.equal(sampled.at(-1).url, state.thumbnailUrl);
    // BUG-009 시안(375×812)의 이미지 520 비율을 기기 높이에 맞춰 유지한다: 874 × 520 / 812 ≈ 560
    assert.deepEqual({ ...sampled.at(-1).frame }, { width: 375, height: 560 });
    assert.deepEqual({ ...sampled.at(-1).area }, { x: 327, y: 59, width: 48, height: 48 });
    assert.deepEqual({ ...sampled.at(-2).area }, { x: 0, y: 59, width: 48, height: 48 });
  }
});

test("ALL·폴더·검색·이미 저장된 상품 안내에서 연 상품 상세는 조회에 성공하면 saved_product_view를 보낸다", () => {
  for (const from of ["all", "folder", "search", "already_saved"]) {
    const { ItemDetailScreen, events } = setup({ id: "7", from });
    ItemDetailScreen();
    assert.deepEqual(JSON.parse(JSON.stringify(events)), [
      ["saved_product_view", { product_id: "7", entry_point: from }],
    ]);
  }
  const { ItemDetailScreen, events } = setup({ id: "7" });
  ItemDetailScreen();
  assert.deepEqual(events, [], "진입 경로 값이 정해지지 않은 상세는 보내지 않는다");
});
