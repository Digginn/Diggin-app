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
  brand: null,
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

test("에이블리처럼 product:brand 메타만 있어도 브랜드를 채우고 공유 링크 추적값을 뗀다", () => {
  const { values } = normalizeProductPage(
    {
      finalUrl:
        "https://mobile.a-bly.com/goods/49239624?tracking_content=68e71e0e15ca83&utm_source=web&https_deeplink=true&short_id=0jn04fd&airbridge_referrer=x",
      og: og({
        title: "피프틴 셔링 퍼프 블라우스",
        image: "https://d3ha2047wt6x28.cloudfront.net/a.gif",
        brand: "제이닝",
        price: "10,970",
        currency: "KRW",
      }),
      ld: null,
      shop: null,
    },
    "https://applink.a-bly.com/0jn04fd",
  );
  assert.equal(values.brand, "제이닝");
  assert.equal(values.price, "10970");
  assert.equal(values.sourceUrl, "https://mobile.a-bly.com/goods/49239624");
});

test("앱 공유 링크의 중간 페이지에서는 제목·이미지가 있어도 끝내지 않고 상품 페이지를 기다린다", () => {
  const sent = [];
  const metas = {
    "og:title": "피프틴 셔링 퍼프 블라우스",
    "og:image": "https://cdn.example.com/a.gif",
    "product:price:amount": "13,520",
  };
  const run = (hostname, now) =>
    runInNewContext(PRODUCT_PAGE_SCRIPT, {
      window: { ReactNativeWebView: { postMessage: (message) => sent.push(JSON.parse(message)) } },
      document: {
        querySelector: (selector) => {
          const key = /"([^"]+)"/.exec(selector)[1];
          return metas[key] ? { getAttribute: () => metas[key] } : null;
        },
        querySelectorAll: () => [],
        getElementById: () => null,
      },
      location: { href: `https://${hostname}/goods/1`, hostname, search: "" },
      URLSearchParams,
      Date: { now },
      JSON,
      setInterval: () => 1,
      clearInterval: () => {},
    });
  run("ably.airbridge.io", () => 0);
  run("applink.a-bly.com", () => 0);
  assert.equal(sent.length, 0, "중간 페이지에서는 바로 보내지 않는다");
  run("mobile.a-bly.com", () => 0);
  assert.equal(sent.length, 1, "상품 페이지에서는 바로 보낸다");
});

test("사이트 이름 메타가 없어도 알려진 쇼핑몰 이름만 제목 끝에서 떼고 색상 같은 상품명 일부는 남긴다", () => {
  const name = (title) =>
    normalizeProductPage(
      {
        finalUrl: "https://shop.example.com/p",
        og: og({ title, image: "https://cdn.example.com/a.jpg" }),
        ld: null,
        shop: null,
      },
      "https://shop.example.com/p",
    ).values.name;
  assert.equal(name("피프틴 셔링 퍼프 블라우스 - 에이블리"), "피프틴 셔링 퍼프 블라우스");
  assert.equal(name("와플 반팔 저지 - 블랙"), "와플 반팔 저지 - 블랙");
  assert.equal(name("번개장터"), "");
});

test("상품명·이미지가 있어도 가격이 아직 없으면 잠깐 더 기다렸다가 보낸다", () => {
  const sent = [];
  const metas = { "og:title": "블라우스", "og:image": "https://cdn.example.com/a.gif" };
  let now = 0;
  let tick;
  runInNewContext(PRODUCT_PAGE_SCRIPT, {
    window: { ReactNativeWebView: { postMessage: (message) => sent.push(JSON.parse(message)) } },
    document: {
      querySelector: (selector) => {
        const key = /"([^"]+)"/.exec(selector)[1];
        return metas[key] ? { getAttribute: () => metas[key] } : null;
      },
      querySelectorAll: () => [],
      getElementById: () => null,
    },
    location: { href: "https://mobile.a-bly.com/goods/1", hostname: "mobile.a-bly.com" },
    Date: { now: () => now },
    JSON,
    setInterval: (callback) => {
      tick = callback;
      return 1;
    },
    clearInterval: () => {},
  });
  assert.equal(sent.length, 0, "가격이 없으면 바로 보내지 않는다");
  now = 1000;
  metas["product:price:amount"] = "13,520";
  metas["product:price:currency"] = "KRW";
  tick();
  assert.equal(sent.length, 1, "가격이 붙으면 그때 보낸다");
  assert.equal(sent[0].og.price, "13,520");
});

test("앱 연결 중간 페이지 주소에 웹 대체 주소가 있으면 그 상품 페이지로 옮긴다", () => {
  let replaced;
  runInNewContext(PRODUCT_PAGE_SCRIPT, {
    window: {
      ReactNativeWebView: { postMessage: () => assert.fail("중간 페이지에서 보내면 안 된다") },
    },
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    location: {
      href: "https://ohouse.airbridge.io/store.ohou.se/goods/3023027?x=1",
      hostname: "ohouse.airbridge.io",
      search:
        "?deeplink_url=ohouseapp%3A%2F%2Fstore.ohou.se%2Fgoods%2F3023027&fallback_desktop=https%3A%2F%2Fstore.ohou.se%2Fgoods%2F3023027%3Futm_source%3Dexternalsharing",
      replace: (url) => {
        replaced = url;
      },
    },
    URLSearchParams,
    Date,
    JSON,
    setInterval: () => 1,
    clearInterval: () => {},
  });
  assert.equal(replaced, "https://store.ohou.se/goods/3023027?utm_source=externalsharing");
});

test("중간 페이지에서 끝나면 사이트 기본 정보를 쓰지 않고 실패로 넘긴다", () => {
  const { values, hasFailed } = normalizeProductPage(
    {
      finalUrl: "https://ohouse.airbridge.io/store.ohou.se/goods/3023027?channel=externalsharing",
      og: og({ title: "오늘의집 - 라이프스타일 슈퍼앱", image: "https://cdn.ohou.se/og.png" }),
      ld: null,
      shop: null,
    },
    "https://ozip.me/D7nPayR",
  );
  assert.equal(hasFailed, true);
  assert.equal(values.name, "");
  assert.equal(values.thumbnailUrl, null);
  assert.equal(values.sourceUrl, "https://ozip.me/D7nPayR");
});

test("오늘의집은 페이지 데이터에서 브랜드만 읽고 상품명·가격은 공개 메타를 쓴다", () => {
  const sent = [];
  const metas = {
    "og:title": "트롬 오브제컬렉션 워시콤보",
    "og:image": "https://prs.ohousecdn.com/a.jpg",
    "product:price:amount": "2979250",
    "product:price:currency": "KRW",
  };
  const nextData = {
    props: {
      pageProps: {
        dehydratedState: {
          queries: [{ state: { data: { production: { brandName: "LG전자" } } } }],
        },
      },
    },
  };
  runInNewContext(PRODUCT_PAGE_SCRIPT, {
    window: { ReactNativeWebView: { postMessage: (message) => sent.push(JSON.parse(message)) } },
    document: {
      querySelector: (selector) => {
        const key = /"([^"]+)"/.exec(selector)[1];
        return metas[key] ? { getAttribute: () => metas[key] } : null;
      },
      querySelectorAll: () => [],
      getElementById: (id) =>
        id === "__NEXT_DATA__" ? { textContent: JSON.stringify(nextData) } : null,
    },
    location: {
      href: "https://store.ohou.se/goods/3023027",
      hostname: "store.ohou.se",
      search: "",
    },
    URLSearchParams,
    Date,
    JSON,
    setInterval: () => 1,
    clearInterval: () => {},
  });
  const { values } = normalizeProductPage(sent[0], "https://ozip.me/D7nPayR");
  assert.equal(values.name, "트롬 오브제컬렉션 워시콤보");
  assert.equal(values.brand, "LG전자");
  assert.equal(values.price, "2979250");
});
