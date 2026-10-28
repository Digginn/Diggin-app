/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");
const Papa = require("papaparse");

function load(file) {
  const filename = path.resolve(__dirname, file);
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText,
    {
      module,
      exports: module.exports,
      TextDecoder,
      URL,
      require: (name) =>
        name.startsWith(".")
          ? load(path.relative(__dirname, path.resolve(path.dirname(filename), name + ".ts")))
          : require(name),
    },
  );
  return module.exports;
}

const policy = load("../src/screens/save/domain/restrictedProduct.ts");
const csv = load("../src/screens/my/domain/prepareCsvImport.ts");
const { normalizeProductPage } = load("../src/screens/save/domain/normalizeProductPage.ts");

test("출시 목록 전체를 부분 문자열로 차단하고 대소문자·공백·전각 표기도 검사한다", () => {
  for (const word of policy.RESTRICTED_PRODUCT_KEYWORDS) {
    assert.equal(policy.isRestrictedProduct(`상품 ${word} 한정`), true, word);
  }
  for (const word of ["ＡＤＵＬＴ", "SEX\n TOY", "성 인 인 증", "１８＋", "청소년\t구매불가"]) {
    assert.equal(policy.isRestrictedProduct(word), true, word);
  }
  assert.equal(policy.isRestrictedProduct("미술 도구"), true, "오탐을 허용한 술 부분 문자열 정책");
  assert.equal(policy.isRestrictedProduct("운동화", ["주류 > 맥주"]), true);
  assert.equal(policy.isRestrictedProduct("운동화", ["신발"]), false);
});

test("화면 이름 길이 제한과 이름 수정으로 추출된 제한 정보를 버리지 않는다", () => {
  const raw = {
    finalUrl: "https://shop.test/item",
    ld: null,
    og: { title: "가".repeat(110) + "성인", image: null, url: null, siteName: null },
    restrictionLabels: ["신발"],
  };
  const result = normalizeProductPage(raw, raw.finalUrl);
  assert.equal(result.values.name.length, 100);
  assert.equal(policy.isRestrictedProduct("운동화", result.values.restrictionLabels), true);
});

test("CSV는 제한 상품만 실패로 제외하고 정상 상품을 계속 저장 계획에 넣는다", () => {
  const headers = [...csv.CSV_REQUIRED_HEADERS, "카테고리"];
  const row = (name, category, id) =>
    headers.map(
      (header) =>
        ({
          "상품명": name,
          "상품 링크": `https://shop.test/${id}`,
          "카테고리": category,
        })[header] ?? "",
    );
  const result = csv.prepareCsvImport(
    {
      name: "items.csv",
      bytes: new TextEncoder().encode(
        Papa.unparse([
          headers,
          row("운동화", "신발", 1),
          row("가".repeat(110) + "성인", "", 2),
          row("선물", "주류", 3),
        ]),
      ),
    },
    {
      importedAt: "2026-10-28T00:00:00Z",
      registeredAtUtcOffsetMinutes: 540,
      existingFolderNames: [],
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.plan.totalCount, 3);
  assert.equal(result.plan.products.length, 1);
  assert.equal(result.plan.failures.length, 2);
  assert.equal(
    result.plan.failures.every((entry) => entry.reason === "RESTRICTED_PRODUCT"),
    true,
  );
});

test("상품 페이지의 JSON-LD 카테고리·연령 정보와 메타 연령 표시를 추출한다", () => {
  const { PRODUCT_PAGE_SCRIPT } = load("../src/screens/save/domain/productPageScript.ts");
  const sent = [];
  const product = {
    "@type": "Product",
    "name": "선물",
    "image": "https://shop.test/image.jpg",
    "category": ["잡화", "주류"],
    "audience": { suggestedMinAge: 19 },
    "offers": { price: 1000 },
  };
  const meta = { "age-restriction": "19" };
  runInNewContext(PRODUCT_PAGE_SCRIPT, {
    location: { href: "https://shop.test/item", hostname: "shop.test", pathname: "/item" },
    URL,
    URLSearchParams,
    Date,
    setInterval: () => 1,
    clearInterval: () => {},
    window: { ReactNativeWebView: { postMessage: (message) => sent.push(JSON.parse(message)) } },
    document: {
      readyState: "complete",
      getElementById: () => null,
      querySelectorAll: (selector) =>
        selector === 'script[type="application/ld+json"]'
          ? [{ textContent: JSON.stringify(product) }]
          : [],
      querySelector: (selector) => {
        const key = /(?:property|name)="([^"]+)"/.exec(selector)?.[1];
        return meta[key] ? { getAttribute: () => meta[key] } : null;
      },
    },
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].restrictionLabels.includes("주류"), true);
  assert.equal(sent[0].restrictionLabels.includes("18+"), true);
  assert.equal(policy.isRestrictedProduct(sent[0].ld.name, sent[0].restrictionLabels), true);
});
