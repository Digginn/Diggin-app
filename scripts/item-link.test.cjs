const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");

// TS 파일에서 정규식만 떼어 와 규칙 자체를 검증한다.
const source = readFileSync(path.join(__dirname, "../src/utils/itemLink.ts"), "utf8");
const pattern = /const ITEM_LINK = (\/.+\/i);/.exec(source)[1];
const ITEM_LINK = eval(pattern);
const ITEM_LINK_ONLY = new RegExp(`^${ITEM_LINK.source}$`, "i");

test("쇼핑몰 주소는 통과하고 호스트가 성립하지 않는 값은 걸러진다", () => {
  for (const ok of [
    "https://www.musinsa.com/products/123",
    "https://m.29cm.co.kr/a/1",
    "https://ohou.se/productions/123",
  ])
    assert.ok(ITEM_LINK_ONLY.test(ok), ok);

  for (const no of [
    "http://www.musinsa.com/products/123",
    "https://ㅁㄴㅇㄹ",
    "https://.",
    "https://abc",
    "https://",
    "그냥 텍스트",
  ])
    assert.ok(!ITEM_LINK_ONLY.test(no), no);
});

test("제목과 함께 복사해도 첫 링크를 뽑는다", () => {
  const text = "엄청 좋은 바지\nhttps://www.musinsa.com/products/123";
  assert.equal(ITEM_LINK.exec(text)[0], "https://www.musinsa.com/products/123");
});

test("링크 없는 긴 공유 텍스트도 앱 주소 검사가 오래 걸리지 않는다", () => {
  const ts = require("typescript");
  const { runInNewContext } = require("node:vm");
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports },
  );
  const { classifyItemLink } = module.exports;
  // 공유 확장은 긴 글도 받는다. 예전 정규식은 이 입력에서 수 초씩 멈췄다.
  const started = Date.now();
  assert.equal(classifyItemLink("a.".repeat(60000)), "no_url");
  assert.ok(Date.now() - started < 300, `${Date.now() - started}ms`);
  assert.equal(classifyItemLink("이거 봐 musinsa://product/1"), "deeplink");
  assert.equal(classifyItemLink("x.musinsa://y"), "deeplink");
  assert.equal(classifyItemLink("https://ㅁㄴㅇㄹ"), "invalid_format");
  assert.equal(classifyItemLink("링크 없는 글"), "no_url");
});
