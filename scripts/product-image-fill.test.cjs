/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(file, mocks, FakeDate = Date) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => mocks[name] ?? require(name),
      setTimeout,
      clearTimeout,
      AbortController,
      Date: FakeDate,
      fetch: globalThis.fetchMock,
    },
  );
  return module.exports;
}

function setup(htmlImage = null, FakeDate = Date) {
  const fills = [];
  const patched = [];
  const fetched = [];
  const filler = load(
    "../src/components/ProductImageFiller.tsx",
    {
      "@react-native-async-storage/async-storage": {
        __esModule: true,
        default: { getItem: async () => null, setItem: async () => {} },
      },
      "react": { useEffect: () => {}, useSyncExternalStore: (_subscribe, get) => get() },
      "react-native": {
        AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
      },
      "@/api/folders": { folderKeys: { all: ["folders"], list: () => ["folders", "list"] } },
      "@/api/products": {
        productKeys: { all: ["products"], detail: (id) => ["products", "detail", id] },
        fillProductImage: async (id, url) => {
          fills.push([id, url]);
          return url;
        },
      },
      "@/lib/queryClient": {
        queryClient: {
          setQueriesData: (filter) => patched.push(filter.queryKey[0]),
          setQueryData: () => {},
          invalidateQueries: async () => {},
        },
      },
      "@/screens/save/components/ProductPageReader": { ProductPageReader: "ProductPageReader" },
      "@/screens/save/api/fetchProductMeta": {
        fetchProductMeta: async (url) => {
          fetched.push(url);
          return typeof htmlImage === "function"
            ? htmlImage(url)
            : htmlImage && { og: { image: htmlImage } };
        },
      },
      "@/screens/save/domain/normalizeProductPage": {
        normalizeProductPage: (raw) => ({ values: { thumbnailUrl: raw.og.image } }),
      },
    },
    FakeDate,
  );
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return { ...filler, fills, patched, fetched, flush };
}

test("보이는 CSV 상품만 하나씩 열고, 읽은 이미지를 저장한 뒤 목록 캐시를 고친다", async () => {
  const { requestProductImages, ProductImageFiller, fills, patched, flush } = setup();
  requestProductImages([
    null,
    { id: "1", imageSourceUrl: undefined },
    { id: "2", imageSourceUrl: "https://a.shop/2" },
    { id: "3", imageSourceUrl: "https://a.shop/3" },
    { id: "4", imageSourceUrl: "https://b.shop/4" },
  ]);
  await flush();
  const first = ProductImageFiller();
  assert.equal(first.props.url, "https://a.shop/2");

  first.props.onDone({ og: { image: "https://img/2.png" } });
  await flush();
  assert.deepEqual(fills, [["2", "https://img/2.png"]]);
  assert.deepEqual(patched, ["products", "folders"]);
  // 같은 쇼핑몰은 간격을 두므로 다른 쇼핑몰 상품을 먼저 연다.
  assert.equal(ProductImageFiller().props.url, "https://b.shop/4");
});

test("시간 초과로 못 읽으면 DB에 기록하지 않고, 이미 시도한 상품은 다시 넣지 않는다", async () => {
  const { requestProductImages, ProductImageFiller, fills, flush } = setup();
  requestProductImages([{ id: "9", imageSourceUrl: "https://c.shop/9" }]);
  await flush();
  ProductImageFiller().props.onDone(null);
  await flush();
  assert.deepEqual(fills, []);
  requestProductImages([{ id: "9", imageSourceUrl: "https://c.shop/9" }]);
  await flush();
  assert.equal(ProductImageFiller(), null);
});

test("HTML에서 이미지를 찾으면 웹뷰를 띄우지 않고 바로 저장한다", async () => {
  const { requestProductImages, ProductImageFiller, fills, flush } = setup("https://img/html.png");
  requestProductImages([{ id: "5", imageSourceUrl: "https://d.shop/5" }]);
  await flush();
  await flush();
  assert.equal(ProductImageFiller(), null);
  assert.deepEqual(fills, [["5", "https://img/html.png"]]);
});

test("HTML 메타는 속성 순서·따옴표와 관계없이 읽고, 실패 응답은 웹뷰로 넘긴다", async () => {
  globalThis.fetchMock = async () => ({
    ok: true,
    url: "https://d.shop/final",
    text: async () =>
      "<meta content='https://img/a.png?w=1&amp;h=2' property='og:image'>" +
      '<meta property="og:title" content="코트 &quot;블랙&quot;">',
  });
  const { fetchProductMeta } = load("../src/screens/save/api/fetchProductMeta.ts", {});
  const raw = await fetchProductMeta("https://d.shop/5");
  assert.equal(raw.finalUrl, "https://d.shop/final");
  assert.equal(raw.og.image, "https://img/a.png?w=1&h=2");
  assert.equal(raw.og.title, '코트 "블랙"');
  globalThis.fetchMock = async () => ({ ok: false });
  assert.equal(
    await load("../src/screens/save/api/fetchProductMeta.ts", {}).fetchProductMeta(
      "https://d.shop/5",
    ),
    null,
  );
});

test("삭제된 상품은 이미지 없음으로 끝내고, 차단한 쇼핑몰은 그날 다시 열지 않는다", async () => {
  const results = { "https://gone.shop/1": "gone", "https://busy.shop/2": "blocked" };
  const { requestProductImages, ProductImageFiller, fills, fetched, flush } = setup(
    (url) => results[url],
  );
  requestProductImages([
    { id: "1", imageSourceUrl: "https://gone.shop/1" },
    { id: "2", imageSourceUrl: "https://busy.shop/2" },
  ]);
  for (let i = 0; i < 4; i++) await flush();
  assert.deepEqual(fills, [["1", null]]);
  assert.equal(ProductImageFiller(), null);
  requestProductImages([{ id: "3", imageSourceUrl: "https://busy.shop/3" }]);
  await flush();
  assert.deepEqual(fetched, ["https://gone.shop/1", "https://busy.shop/2"]);
});

test("스마트스토어는 목록에서 읽지 않고, 상세를 열면 HTML 없이 웹뷰로 읽는다", async () => {
  const { requestProductImages, requestProductImageNow, ProductImageFiller, fetched, flush } =
    setup();
  const url = "https://m.smartstore.naver.com/shop/products/1";
  requestProductImages([{ id: "7", imageSourceUrl: url }]);
  await flush();
  assert.equal(ProductImageFiller(), null);
  requestProductImageNow("7", url);
  await flush();
  await flush();
  assert.equal(ProductImageFiller().props.url, url);
  assert.deepEqual(fetched, []);
});

test("쇼핑몰별 하루 100개를 넘으면 그 쇼핑몰만 멈추고, 상세에서 연 상품은 읽는다", async () => {
  const clock = { now: Date.now() };
  class FakeDate extends Date {
    static now() {
      return clock.now;
    }
  }
  const { requestProductImages, requestProductImageNow, ProductImageFiller, flush } = setup(
    null,
    FakeDate,
  );
  for (let i = 0; i < 100; i++) {
    requestProductImages([{ id: `bulk-${i}`, imageSourceUrl: `https://bulk.shop/${i}` }]);
    await flush();
    ProductImageFiller().props.onDone(null);
    await flush();
    clock.now += 3001;
  }
  requestProductImages([
    { id: "late", imageSourceUrl: "https://bulk.shop/late" },
    { id: "other", imageSourceUrl: "https://other.shop/1" },
  ]);
  await flush();
  assert.equal(ProductImageFiller().props.url, "https://other.shop/1");
  ProductImageFiller().props.onDone(null);
  await flush();
  assert.equal(ProductImageFiller(), null);
  requestProductImageNow("tap", "https://bulk.shop/tap");
  await flush();
  await flush();
  assert.equal(ProductImageFiller().props.url, "https://bulk.shop/tap");
});
