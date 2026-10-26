/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

const SHORT = "https://naver.me/GdTGsdkm";
const PRODUCT = "https://m.smartstore.naver.com/ssg_9007/products/10889520045";
const DESKTOP = "https://smartstore.naver.com/koyasangsa/products/13372231540";
const MOBILE = "https://m.smartstore.naver.com/koyasangsa/products/13372231540";
function load(file, mocks = {}) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      AbortController,
      setTimeout,
      clearTimeout,
      require: (name) =>
        mocks[name] ??
        (name.startsWith(".")
          ? load(path.join(path.dirname(file), name + ".ts"), mocks)
          : require(name)),
    },
  );
  return module.exports;
}
function resolver(fetch) {
  return load("../src/screens/save/api/resolveProductPageUrl.ts", { "expo/fetch": { fetch } });
}

test("네이버 짧은 링크는 상품 주소를 확인한 뒤 WebView를 열고 결과는 한 번만 전달한다", async () => {
  const states = [],
    effects = [],
    refs = [],
    requests = [],
    done = [];
  let cursor = 0,
    refCursor = 0,
    resolveHead;
  const api = {
    ...resolver(() => assert.fail("Unexpected HTTP request")),
    isNaverShortLink: (url) => url === SHORT,
    resolveProductPageUrl: async () => PRODUCT,
  };
  const mocks = {
    "react": {
      useState(initial) {
        const i = cursor++;
        if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
        return [
          states[i],
          (value) => {
            states[i] = value;
          },
        ];
      },
      useEffect(effect) {
        effects.push(effect);
      },
      useCallback: (fn) => fn,
      useRef(initial) {
        return refs[refCursor++] ?? (refs[refCursor - 1] = { current: initial });
      },
    },
    "react-native": { View: "View", useWindowDimensions: () => ({ width: 393, height: 852 }) },
    "react-native-webview": { WebView: "WebView" },
    "../domain/productPageScript": { PRODUCT_PAGE_SCRIPT: "extract" },
    "../api/resolveProductPageUrl": api,
  };
  const { ProductPageReader } = load("../src/screens/save/components/ProductPageReader.tsx", mocks);
  const render = () => {
    cursor = refCursor = 0;
    return ProductPageReader({ url: SHORT, onDone: (value) => done.push(value) });
  };
  const find = (node) =>
    React.isValidElement(node)
      ? node.type === "WebView"
        ? node
        : React.Children.toArray(node.props.children).map(find).find(Boolean)
      : undefined;
  assert.equal(find(render()), undefined, "짧은 링크를 먼저 WebView로 열면 실패가 재현된다");
  api.resolveProductPageUrl = resolver((url, options) => {
    requests.push({ url, options });
    return new Promise((resolve) => {
      resolveHead = resolve;
    });
  }).resolveProductPageUrl;
  const cleanups = effects.map((effect) => effect());
  resolveHead({ status: 307, headers: new Headers({ Location: PRODUCT }) });
  await new Promise((resolve) => setImmediate(resolve));
  const view = find(render());
  assert.equal(view.props.source.uri, PRODUCT);
  assert.equal(requests[0].options.method, "HEAD");
  assert.equal(requests[0].options.redirect, "manual");
  view.props.onMessage({
    nativeEvent: {
      data: JSON.stringify({
        finalUrl: PRODUCT,
        shop: { name: "상품", brand: "신신고", price: 39850 },
      }),
    },
  });
  view.props.onError();
  assert.equal(done.length, 1);
  assert.equal(done[0].shop.price, 39850);
  cleanups.forEach((cleanup) => cleanup?.());
});

test("스마트스토어 PC 상품 주소는 추가 HTTP 요청 없이 모바일 주소로 WebView를 연다", () => {
  const api = resolver(() => assert.fail("상품 페이지는 WebView로만 연다"));
  const { ProductPageReader } = load("../src/screens/save/components/ProductPageReader.tsx", {
    "react": {
      useState: () => [null, () => {}],
      useRef: () => ({ current: false }),
      useCallback: (callback) => callback,
      useEffect: () => {},
    },
    "react-native": { View: "View", useWindowDimensions: () => ({ width: 393, height: 852 }) },
    "react-native-webview": { WebView: "WebView" },
    "../domain/productPageScript": { PRODUCT_PAGE_SCRIPT: "extract" },
    "../api/resolveProductPageUrl": api,
  });
  const suffix = "?NaPm=tracking#detail";
  const view = ProductPageReader({ url: DESKTOP + suffix, onDone() {} }).props.children;
  assert.equal(view.props.source.uri, MOBILE + suffix);
});

test("짧은 링크의 PC 상품 목적지도 모바일로 바꾸고 다른 사이트·비상품 주소는 보존한다", async () => {
  let requests = 0;
  const { resolveProductPageUrl } = resolver(async () => {
    requests++;
    return { status: 307, headers: new Headers({ Location: DESKTOP }) };
  });
  assert.equal(await resolveProductPageUrl(DESKTOP), MOBILE);
  assert.equal(requests, 0);
  assert.equal(await resolveProductPageUrl(SHORT), MOBILE);
  assert.equal(requests, 1);
  for (const url of [
    MOBILE,
    "https://smartstore.naver.com/koyasangsa/category/1",
    "https://smartstore.naver.com.evil.test/koyasangsa/products/13372231540",
    "https://smartstore.naver.com@evil.test/koyasangsa/products/13372231540",
    "https://example.com/koyasangsa/products/13372231540",
    "https://brand.naver.com/koyasangsa/products/13372231540",
  ])
    assert.equal(await resolveProductPageUrl(url), url);
  assert.equal(requests, 1);
});

test("실제 307 응답의 Location만 읽고 쇼핑몰 방문·해석은 기존 WebView에 맡긴다", async () => {
  const requests = [];
  const { resolveProductPageUrl } = resolver(async (url, options) => {
    requests.push({ url, options });
    return { status: 307, headers: new Headers({ Location: PRODUCT }) };
  });
  assert.equal(await resolveProductPageUrl(SHORT), PRODUCT);
  for (const url of [
    PRODUCT,
    "https://example.com/product/1",
    "https://naver.me.example.com/GdTGsdkm",
    "https://naver.me@evil.test/x",
  ]) {
    assert.equal(await resolveProductPageUrl(url), url);
  }
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.credentials, "omit");
});

test("오류·목적지 누락·앱 링크·비상품 주소면 원래 링크를 보존한다", async () => {
  for (const response of [
    { status: 200, headers: new Headers({ Location: PRODUCT }) },
    { status: 429, headers: new Headers() },
    { status: 307, headers: new Headers() },
    ...[
      "http://m.smartstore.naver.com/x/products/1",
      "naversearchapp://x",
      "https://smartstore.naver.com.evil.test/x/products/1",
      "https://blog.naver.com/x",
      "https://smartstore.naver.com/x",
    ].map((location) => ({ status: 302, headers: new Headers({ Location: location }) })),
  ]) {
    assert.equal(await resolver(async () => response).resolveProductPageUrl(SHORT), SHORT);
  }
  assert.equal(
    await resolver(async () => {
      throw new TypeError("offline");
    }).resolveProductPageUrl(SHORT),
    SHORT,
  );
});

test("화면 이탈로 주소 확인을 취소하면 요청을 중단하고 미리 취소된 요청은 보내지 않는다", async () => {
  const abort = new AbortController();
  let requests = 0,
    requestSignal;
  const { resolveProductPageUrl } = resolver((_url, options) => {
    requests++;
    requestSignal = options.signal;
    return new Promise((_resolve, reject) =>
      options.signal.addEventListener("abort", () => reject(new Error("cancelled")), {
        once: true,
      }),
    );
  });
  const pending = resolveProductPageUrl(SHORT, abort.signal);
  abort.abort();
  assert.equal(await pending, SHORT);
  assert.equal(requestSignal.aborted, true);
  assert.equal(await resolveProductPageUrl(SHORT, abort.signal), SHORT);
  assert.equal(requests, 1);
});
