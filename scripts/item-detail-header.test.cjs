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

test("상품 상세의 양쪽 48px 터치 영역 밝기를 각각 적용하고 케밥 SVG에 색을 전달한다", () => {
  const moreSvg = (props) => React.createElement("MoreSvg", props);
  let thumbnailUrl = "https://shop.test/dark.jpg";
  let backDark = true,
    moreDark = true;
  const sampled = [];
  const mocks = {
    "react": { useRef: () => ({ current: null }), useState: (initial) => [initial, () => {}] },
    "react-native": {
      View: "View",
      Text: "Text",
      ScrollView: "ScrollView",
      Pressable: "Pressable",
      useWindowDimensions: () => ({ width: 375, height: 874 }),
    },
    "expo-image": { Image: "Image" },
    "expo-linear-gradient": { LinearGradient: "LinearGradient" },
    "expo-router": { useLocalSearchParams: () => ({ id: "1" }), useRouter: () => ({}) },
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
    "@/screens/all/mutations/useDeleteProducts": { useDeleteProducts: () => ({}) },
    "./queries/useProduct": {
      useProduct: () => ({ data: { values: { thumbnailUrl, brand: "" } } }),
    },
    "./queries/useProductFolderIds": { useProductFolderIds: () => ({ data: [] }) },
    "./mutations/useUpdateProduct": { useUpdateProduct: () => ({}) },
    "./mutations/useSaveProductFolders": { useSaveProductFolders: () => ({}) },
    "./hooks/useIsImageDark": {
      useIsImageDark: (url, frame, area) => {
        sampled.push({ url, frame, area });
        return area.x === 0 ? backDark : moreDark;
      },
    },
  };
  mocks["@/components/app-bar"] = { AppBar: { IconButton: "IconButton" } };
  const { IconButton } = load("src/components/app-bar/IconButton.tsx", mocks);
  const { ItemDetailScreen } = load("src/screens/item-detail/ItemDetailScreen.tsx", mocks);
  for (const [back, more] of [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ]) {
    backDark = back;
    moreDark = more;
    thumbnailUrl = `https://shop.test/${back}-${more}.jpg`;
    const buttons = nodes(ItemDetailScreen()).filter((node) => node.type === "IconButton");
    const previous = buttons.find((node) => node.props.accessibilityLabel === "뒤로 가기");
    const menu = buttons.find((node) => node.props.accessibilityLabel === "아이템 더보기");
    assert.equal(previous.props.className, back ? "text-gray-0" : "text-gray-900");
    assert.equal(menu.props.className, more ? "text-gray-0" : "text-gray-900");
    const icon = IconButton(menu.props).props.children;
    assert.equal(icon.type(icon.props).props.color, more ? "#FFFFFF" : "#1E1E1E");
    assert.equal(sampled.at(-1).url, thumbnailUrl);
    // BUG-009 시안(375×812)의 이미지 520 비율을 기기 높이에 맞춰 유지한다: 874 × 520 / 812 ≈ 560
    assert.deepEqual({ ...sampled.at(-1).frame }, { width: 375, height: 560 });
    assert.deepEqual({ ...sampled.at(-1).area }, { x: 327, y: 59, width: 48, height: 48 });
    assert.deepEqual({ ...sampled.at(-2).area }, { x: 0, y: 59, width: 48, height: 48 });
  }
});
