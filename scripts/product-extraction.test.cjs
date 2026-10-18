const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(file) {
  const source = readFileSync(path.join(__dirname, file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (name) =>
      name.startsWith("./")
        ? load(`../src/screens/save/domain/${name.slice(2)}.ts`)
        : require(name),
  });
  return module.exports;
}

const { normalizeProductPage, stripTrackingParams } = load(
  "../src/screens/save/domain/normalizeProductPage.ts",
);
const { PRODUCT_PAGE_SCRIPT } = load("../src/screens/save/domain/productPageScript.ts");

const og = (fields = {}) => ({
  title: null,
  image: null,
  url: null,
  siteName: null,
  price: null,
  currency: null,
  ...fields,
});

test("스마트스토어는 공개 메타 제목이 스토어명이라 페이지 데이터의 상품명·할인가·브랜드를 쓴다", () => {
  const { values, hasFailed } = normalizeProductPage(
    {
      finalUrl: "https://m.smartstore.naver.com/monadal/products/11014193637",
      og: og({
        title: "모나달 잡화점 : 네이버 스마트스토어",
        image: "https://shop-phinf.pstatic.net/a.png?type=o1000",
      }),
      ld: null,
      shop: {
        name: "별의 커비 캐릭터 핸드워시 디스펜서 거품용기",
        brand: "별의커비",
        price: 25800,
      },
    },
    "https://m.smartstore.naver.com/monadal/products/11014193637",
  );
  assert.equal(hasFailed, false);
  assert.equal(values.name, "별의 커비 캐릭터 핸드워시 디스펜서 거품용기");
  assert.equal(values.brand, "별의커비");
  assert.equal(values.price, "25800");
  assert.equal(values.thumbnailUrl, "https://shop-phinf.pstatic.net/a.png?type=o1000");
});

test("JSON-LD가 있으면 공개 메타보다 먼저 쓰고, 원화일 때만 가격을 넣는다", () => {
  const musinsa = normalizeProductPage(
    {
      finalUrl: "https://www.musinsa.com/products/913589",
      og: og({
        title: "제이반스 클래식(JBANS CLASSIC) 글랜체크 울머플러 - 사이즈 & 후기 | 무신사",
        image: "https://image.msscdn.net/a.jpg",
        price: "32000",
        currency: "KRW",
      }),
      ld: {
        name: "글랜체크 울머플러 (C1804-AM960PK)",
        brand: "제이반스 클래식",
        image: null,
        price: "32000",
        currency: "KRW",
      },
      shop: null,
    },
    "https://www.musinsa.com/app/goods/913589",
  );
  assert.equal(musinsa.values.name, "글랜체크 울머플러 (C1804-AM960PK)");
  assert.equal(musinsa.values.brand, "제이반스 클래식");
  assert.equal(musinsa.values.price, "32000");
  assert.equal(
    musinsa.values.sourceUrl,
    "https://www.musinsa.com/products/913589",
    "SAVE-003 최종 주소",
  );

  const overseas = normalizeProductPage(
    {
      finalUrl: "https://www.dollskill.com/products/a",
      og: og({
        title: "Mini Dress",
        image: "https://cdn.dollskill.com/a.jpg",
        price: "106",
        currency: "USD",
      }),
      ld: { name: "Mini Dress", brand: null, image: null, price: 106, currency: "USD" },
      shop: null,
    },
    "https://www.dollskill.com/products/a",
  );
  assert.equal(overseas.values.price, "", "원화가 아니면 가격을 비운다");
});

test("공개 메타만 있으면 제목 뒤 사이트 이름을 떼고, 쉼표 가격도 읽는다", () => {
  const { values } = normalizeProductPage(
    {
      finalUrl: "https://mobile.a-bly.com/goods/5259534",
      og: og({
        title: "twisted loose knit hood zip up - 에이블리",
        image: "https://imgb.a-bly.com/data/goods/a.gif",
        siteName: "에이블리",
        price: "25,080",
        currency: "KRW",
      }),
      ld: null,
      shop: null,
    },
    "https://a-bly.com/app/goods/5259534",
  );
  assert.equal(values.name, "twisted loose knit hood zip up");
  assert.equal(values.price, "25080");
});

test("상품명을 못 읽으면 실패로 보고 사이트 로고 이미지와 최종 주소를 쓰지 않는다(SAVE-007)", () => {
  const { values, hasFailed } = normalizeProductPage(
    {
      finalUrl: "https://nid.naver.com/nidlogin.login?url=x",
      og: og({
        title: "번개장터",
        siteName: "번개장터",
        image: "https://static.bunjang.co.kr/og-image.webp",
      }),
      ld: null,
      shop: null,
    },
    "https://m.bunjang.co.kr/products/176954448",
  );
  assert.equal(hasFailed, true);
  assert.equal(values.name, "");
  assert.equal(values.thumbnailUrl, null);
  assert.equal(values.sourceUrl, "https://m.bunjang.co.kr/products/176954448");
});

test("og:url이 홈페이지인 사이트 기본 메타는 상품 정보로 쓰지 않는다", () => {
  const { values, hasFailed } = normalizeProductPage(
    {
      finalUrl: "https://m.bunjang.co.kr/products/176954448",
      og: og({
        title: "번개장터",
        image: "https://static.bunjang.co.kr/web/ui/og-image.webp",
        url: "http://m.bunjang.co.kr",
      }),
      ld: null,
      shop: null,
    },
    "https://m.bunjang.co.kr/products/176954448",
  );
  assert.equal(hasFailed, true);
  assert.equal(values.name, "");
  assert.equal(values.thumbnailUrl, null);
});

test("상품명 100자·브랜드 30자에서 자르고 이모지 중간에서 끊지 않으며, 잘못된 가격·http 이미지는 버린다", () => {
  const { values } = normalizeProductPage(
    {
      finalUrl: "https://shop.example.com/p",
      og: og({
        title: `${"가".repeat(99)}👍🏻끝`,
        image: "http://insecure.example.com/a.jpg",
        price: "1.5",
        currency: "KRW",
      }),
      ld: null,
      shop: { name: null, brand: "브".repeat(40), price: null },
    },
    "https://shop.example.com/p",
  );
  assert.equal(values.name, "가".repeat(99), "👍🏻은 코드 포인트 2개라 100자를 넘으면 통째로 뺀다");
  assert.equal(values.brand, "브".repeat(30));
  assert.equal(values.price, "");
  assert.equal(values.thumbnailUrl, null);
});

test("페이지 스크립트는 상품명과 이미지가 잡히면 재료를 앱으로 보낸다", () => {
  const sent = [];
  const metas = {
    "og:title": "옵텐소 brioche jersey skirt (2color)",
    "og:image": "https://cf.product-image.s.zigzag.kr/a.jpeg",
  };
  const nextData = {
    props: {
      pageProps: {
        dehydratedState: {
          queries: [
            {
              state: {
                data: {
                  shop: { name: "옵텐소" },
                  product: {
                    name: "brioche jersey skirt (2color)",
                    product_price: { display_final_price: { final_price: { price: 25850 } } },
                  },
                },
              },
            },
          ],
        },
      },
    },
  };
  const document = {
    querySelector: (selector) => {
      const key = /"([^"]+)"/.exec(selector)[1];
      return metas[key] ? { getAttribute: () => metas[key] } : null;
    },
    querySelectorAll: () => [],
    getElementById: (id) =>
      id === "__NEXT_DATA__" ? { textContent: JSON.stringify(nextData) } : null,
  };
  const window = {
    ReactNativeWebView: { postMessage: (message) => sent.push(JSON.parse(message)) },
  };
  runInNewContext(PRODUCT_PAGE_SCRIPT, {
    window,
    document,
    location: { href: "https://zigzag.kr/catalog/products/134252806", hostname: "zigzag.kr" },
    Date,
    JSON,
    setInterval: () => 1,
    clearInterval: () => {},
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].shop.name, "brioche jersey skirt (2color)");
  assert.equal(sent[0].shop.brand, "옵텐소");
  assert.equal(sent[0].shop.price, 25850);
  assert.equal(sent[0].og.image, "https://cf.product-image.s.zigzag.kr/a.jpeg");
});

test("광고 추적값만 떼고 상품을 가르는 쿼리 값은 남긴다", () => {
  assert.equal(
    stripTrackingParams(
      "https://m.brand.naver.com/xenicsholic/products/10497985918?nt_source=meta&nt_medium=ad&utm_medium=paid&fbclid=PAZ",
    ),
    "https://m.brand.naver.com/xenicsholic/products/10497985918",
  );
  assert.equal(
    stripTrackingParams(
      "https://www.coupang.com/vp/products/9742886795?vendorItemId=96055843414&sourceType=HOME_GW&searchId=feed-1",
    ),
    "https://www.coupang.com/vp/products/9742886795?vendorItemId=96055843414",
  );
  assert.equal(
    stripTrackingParams(
      "https://product.29cm.co.kr/catalog/2028018?is_retargeting=true&source_caller=api#review",
    ),
    "https://product.29cm.co.kr/catalog/2028018#review",
  );
  assert.equal(
    stripTrackingParams("https://zigzag.kr/catalog/products/1"),
    "https://zigzag.kr/catalog/products/1",
  );
  assert.equal(
    stripTrackingParams("https://shop.example.com/p?option=red&size=M"),
    "https://shop.example.com/p?option=red&size=M",
  );
});
