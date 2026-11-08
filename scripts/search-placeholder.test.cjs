/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

const API = {
  productKeys: {
    list: (sort, wishLevel, query = "") => ["products", "list", sort, wishLevel, query],
    counts: (query = "") => ["products", "counts", query],
  },
  PRODUCT_PAGE_SIZE: 20,
  fetchProductPage: () => {},
  fetchProductCounts: () => {},
};

function placeholderOf(file, args) {
  let options;
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(path.resolve(__dirname, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => {
      if (name === "@tanstack/react-query")
        return {
          useQuery: (value) => (options = value),
          useInfiniteQuery: (value) => (options = value),
        };
      if (name === "@/api/products") return API;
      return require(name);
    },
  });
  Object.values(module.exports)[0](...args);
  return options.placeholderData;
}

const previous = { all: "ALL 아이템 전체" };

for (const [file, args, emptyKey, searchedKey] of [
  [
    "../src/hooks/useProductList.ts",
    ["latest", null, "가방"],
    ["products", "list", "latest", null, ""],
    ["products", "list", "latest", null, "가"],
  ],
  [
    "../src/hooks/useProductCounts.ts",
    ["가방"],
    ["products", "counts", ""],
    ["products", "counts", "가"],
  ],
]) {
  test(`${path.basename(file)}: 첫 검색에 ALL 결과를 잠깐 보여주지 않고 검색어끼리만 이전 결과를 둔다`, () => {
    const placeholder = placeholderOf(file, args);
    assert.equal(placeholder(previous, { queryKey: emptyKey }), undefined);
    assert.equal(placeholder(previous, { queryKey: searchedKey }), previous);
    assert.equal(placeholder(undefined, undefined), undefined);
  });
}

test("검색어가 없는 ALL 목록은 이전 결과를 두지 않는다", () => {
  const placeholder = placeholderOf("../src/hooks/useProductList.ts", ["latest", null, ""]);
  assert.equal(
    placeholder(previous, { queryKey: ["products", "list", "latest", null, "가"] }),
    undefined,
  );
});
