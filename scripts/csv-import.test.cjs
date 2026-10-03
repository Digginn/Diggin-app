/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function setup(pick, bottomInset = 34) {
  const alerts = [];
  const toasts = [];
  const showToast = (...args) => toasts.push(args);
  const selecting = [];
  const refs = [];
  const states = [];
  let refCursor = 0;
  let stateCursor = 0;
  const screenModule = { exports: {} };
  const source = readFileSync(
    path.join(__dirname, "../src/screens/my/CsvImportScreen.tsx"),
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports: screenModule.exports,
      module: screenModule,
      require: (name) => {
        if (name === "react")
          return {
            ...React,
            useEffect: () => {},
            useRef: (initial) => refs[refCursor++] ?? (refs[refCursor - 1] = { current: initial }),
            useState: (initial) => {
              const index = stateCursor++;
              if (!(index in states)) states[index] = initial;
              return [
                states[index],
                (value) => {
                  states[index] = value;
                  if (index === 1) selecting.push(value);
                },
              ];
            },
          };
        if (name === "react-native")
          return {
            View: "View",
            Text: "Text",
            ScrollView: "ScrollView",
            Alert: { alert: (...args) => alerts.push(args) },
            useWindowDimensions: () => ({ width: 375, height: 812 }),
          };
        if (name === "expo-document-picker") return { getDocumentAsync: pick };
        if (name === "expo-status-bar") return { StatusBar: "StatusBar" };
        if (name === "react-native-safe-area-context")
          return { useSafeAreaInsets: () => ({ bottom: bottomInset }) };
        if (name === "@/components/app-bar") return { AppBar: "AppBar" };
        if (name === "@/components/Button") return { Button: "Button" };
        if (name === "@/hooks/useToast") return { useToast: () => showToast };
        if (name === "@/theme") return { colors: { gray: { 0: "#FFFFFF" } } };
        if (name === "./components/CsvImportIllustration")
          return { CsvImportIllustration: "CsvImportIllustration" };
        if (name === "./components/CsvImportLoading")
          return { CsvImportLoading: "CsvImportLoading" };
        if (name === "./components/CsvImportResultModal")
          return { CsvImportResultModal: "CsvImportResultModal" };
        return require(name);
      },
    },
  );
  const render = (props) => {
    refCursor = 0;
    stateCursor = 0;
    return screenModule.exports.CsvImportScreen(props);
  };
  function find(node, type) {
    if (!React.isValidElement(node)) return;
    if (node.type === type) return node;
    return React.Children.toArray(node.props.children)
      .map((child) => find(child, type))
      .find(Boolean);
  }
  const select = (props) => {
    return find(render(props), "Button").props.onPress();
  };
  return { render, select, alerts, toasts, selecting, find };
}

test("CSV 소개 화면에 밝은 상태바·어두운 AppBar·safe area·공통 버튼을 적용한다", () => {
  const { render, find } = setup();
  const children = React.Children.toArray(render().props.children);
  assert.equal(children[0].props.style, "light");
  assert.equal(children[2].props.title, "불러오기");
  assert.equal(children[2].props.colorScheme, "dark");
  const button = find(render(), "Button");
  assert.equal(button.props.children, "CSV 파일로 데이터 불러오기");
  assert.equal(button.props.size, "large");
});

test("CSV 버튼 아래에 Figma의 최소 44dp 간격을 확보하고 큰 safe area도 보호한다", () => {
  for (const bottomInset of [0, 14, 34, 60]) {
    const { render } = setup(undefined, bottomInset);
    const content = React.Children.toArray(render().props.children).find(
      (node) => node.type === React.Fragment,
    );
    const footer = React.Children.toArray(content.props.children).at(-1);
    assert.equal(
      footer.props.style.paddingBottom,
      Math.max(44, bottomInset + 10),
      `bottom inset ${bottomInset}: 버튼이 화면 아래에 붙으면 안 됩니다`,
    );
  }
});

test("CSV 대문자 확장자를 허용하고 선택한 파일을 부모 콜백에 전달한다", async () => {
  const file = { name: "관심상품.CSV", uri: "file:///cache/wishlist.csv" };
  const selected = [];
  const { select, alerts, selecting } = setup(async (options) => {
    assert.equal(options.multiple, false);
    assert.equal(options.copyToCacheDirectory, true);
    return { canceled: false, assets: [file] };
  });
  await select({ onSelectCsv: (value) => selected.push(value) });
  assert.equal(selected[0], file);
  assert.equal(alerts.length, 0);
  assert.deepEqual(selecting, [true, false]);
});

test("파일 선택 취소는 콜백이나 오류 안내 없이 종료한다", async () => {
  const { select, alerts } = setup(async () => ({ canceled: true, assets: null }));
  await select({ onSelectCsv: () => assert.fail("취소된 파일을 전달하면 안 됩니다") });
  assert.equal(alerts.length, 0);
});

test("CSV가 아닌 파일과 비어 있는 선택 결과는 저장 콜백으로 넘기지 않는다", async () => {
  for (const assets of [[{ name: "wishlist.csv.exe" }], []]) {
    const { select, alerts } = setup(async () => ({ canceled: false, assets }));
    await select({ onSelectCsv: () => assert.fail("잘못된 파일을 전달하면 안 됩니다") });
    assert.equal(alerts[0][0], "파일 형식 확인");
  }
});

test("선택기 및 부모 처리 실패를 안내하고 버튼 상태를 복구한다", async () => {
  for (const failsInPicker of [true, false]) {
    const { select, alerts, selecting } = setup(async () => {
      if (failsInPicker) throw new Error("picker failed");
      return { canceled: false, assets: [{ name: "wishlist.csv" }] };
    });
    await select({
      onSelectCsv: async () => {
        throw new Error("callback failed");
      },
    });
    assert.equal(alerts[0][0], "파일 불러오기 실패");
    assert.deepEqual(selecting, [true, false]);
  }
});

test("버튼 연타로 시스템 선택기를 중복 실행하지 않는다", async () => {
  let calls = 0;
  let finish;
  const { select } = setup(() => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = select();
  await select();
  assert.equal(calls, 1);
  finish({ canceled: true, assets: null });
  await pending;
  const next = select();
  assert.equal(calls, 2);
  finish({ canceled: true, assets: null });
  await next;
});

test("상품 정보가 없는 처리 결과는 에러 토스트를 표시하고 다시 파일을 선택할 수 있다", async () => {
  const { select, render, find, toasts, alerts } = setup(async () => ({
    canceled: false,
    assets: [{ name: "wishlist.csv" }],
  }));
  await select({ onSelectCsv: async () => ({ error: "missing-product-info" }) });
  assert.deepEqual(toasts, [["파일에서 상품 정보를 찾을 수 없습니다.", "error"]]);
  assert.equal(alerts.length, 0);
  assert.equal(find(render(), "CsvImportResultModal").props.result, null);
  assert.equal(find(render(), "Button").props.isDisabled, false);
  await select({ onSelectCsv: async () => ({ error: "missing-product-info" }) });
  assert.equal(toasts.length, 2);
});

test("불러오기 콜백의 진행 개수와 결과를 표시하고 확인으로 초기화한다", async () => {
  const { render, find, select } = setup(async () => ({
    canceled: false,
    assets: [{ name: "wishlist.csv" }],
  }));
  let finish;
  const result = {
    importedCount: 42,
    excludedProducts: [
      { id: "1", productName: "상품", reason: "이미 저장된 상품입니다.", kind: "duplicate" },
    ],
  };
  const props = {
    onSelectCsv: (file, onProgress) => {
      onProgress({ completed: 12, total: 48 });
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const pending = select(props);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(find(render(props), "CsvImportLoading").props.progress, {
    completed: 12,
    total: 48,
  });
  assert.equal(find(render(props), "Button"), undefined);
  finish(result);
  await pending;
  let modal = find(render(props), "CsvImportResultModal");
  assert.equal(modal.props.result, result);
  modal.props.onShowExcluded();
  modal = find(render(props), "CsvImportResultModal");
  assert.equal(modal.props.isExcludedListOpen, true);
  modal.props.onCloseExcluded();
  assert.equal(find(render(props), "CsvImportResultModal").props.isExcludedListOpen, false);
  modal.props.onConfirm();
  assert.equal(find(render(props), "CsvImportResultModal").props.result, null);
});

function loadResultModal() {
  const componentModule = { exports: {} };
  const source = readFileSync(
    path.join(__dirname, "../src/screens/my/components/CsvImportResultModal.tsx"),
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports: componentModule.exports,
      module: componentModule,
      require: (name) => {
        if (name === "react-native")
          return {
            Pressable: "Pressable",
            ScrollView: "ScrollView",
            Text: "Text",
            View: "View",
            useWindowDimensions: () => ({ height: 812 }),
          };
        if (name === "react-native-safe-area-context")
          return { useSafeAreaInsets: () => ({ top: 50, bottom: 34 }) };
        if (name === "@/assets/images/my/csv") return { IconCsvClose: "IconCsvClose" };
        if (name === "@/components/Button") return { Button: "Button" };
        if (name === "@/components/modal") return { Modal: "Modal" };
        return require(name);
      },
    },
  );
  return componentModule.exports.CsvImportResultModal;
}

function textContent(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement(node)) return "";
  return React.Children.toArray(node.props.children).map(textContent).join("");
}

test("완료·중복 제외·전체 성공·전체 실패의 제목과 개수를 결과에서 계산한다", () => {
  const render = loadResultModal();
  const failed = Array.from({ length: 8 }, (_, id) => ({
    id: String(id),
    productName: "상품",
    reason: "정보 누락",
    kind: "failed",
  }));
  const duplicates = Array.from({ length: 3 }, (_, id) => ({
    id: `duplicate-${id}`,
    productName: "중복 상품",
    reason: "이미 저장된 상품입니다.",
    kind: "duplicate",
  }));
  for (const [count, excluded, expected] of [
    [
      42,
      [...failed, ...duplicates],
      "총 42개의 상품을 가져왔습니다.\n가져오지 못한 상품 8개와\n중복 상품 3개는 제외했습니다.",
    ],
    [50, duplicates, "총 50개의 상품을 가져왔습니다.\n중복 상품 3개는 제외했습니다."],
    [53, [], "총 53개의 상품을 가져왔습니다."],
    [0, [...failed, ...duplicates], "가져올 수 있는 상품이 없습니다."],
  ]) {
    const node = render({
      result: { importedCount: count, excludedProducts: excluded },
      isExcludedListOpen: false,
    });
    const text = textContent(node).replace(/\s+\n/g, "\n");
    assert.ok(text.includes(expected), text);
    assert.equal(text.includes("제외된 상품 보기"), excluded.length > 0);
    assert.ok(
      text.includes(count === 0 ? "상품을 가져오지 못했습니다" : "상품 가져오기가 완료되었습니다"),
    );
    if (count === 0) assert.ok(text.includes("제외된 상품 11개를 확인해주세요."));
  }
});

test("제외 목록은 모든 항목·사유를 렌더링하고 X와 확인은 서로 다른 콜백이다", () => {
  const render = loadResultModal();
  const onCloseExcluded = () => {};
  const onConfirm = () => {};
  const result = {
    importedCount: 0,
    excludedProducts: Array.from({ length: 11 }, (_, id) => ({
      id: String(id),
      productName: `상품 ${id}`,
      reason: `사유 ${id}`,
      kind: id < 8 ? "failed" : "duplicate",
    })),
  };
  const node = render({ result, isExcludedListOpen: true, onCloseExcluded, onConfirm });
  assert.equal(node.props.onRequestClose, onCloseExcluded);
  assert.equal(node.props.scrimOpacity, 0.36);
  const text = textContent(node);
  assert.ok(text.includes("제외된 상품 11개"));
  assert.ok(text.includes("상품 10사유 10"));
  const children = React.Children.toArray(node.props.children.props.children);
  assert.equal(children[2].type, "ScrollView");
  assert.equal(React.Children.count(children[2].props.children), 11);
  assert.equal(children.at(-1).props.onPress, onConfirm);
});
