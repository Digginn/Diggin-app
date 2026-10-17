/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function loadProductsApi(rows = [], counts = {}) {
  const calls = [];
  const query = (table) => {
    const call = { table, filters: [], orders: [] };
    calls.push(call);
    const builder = {
      select: (columns, options) => {
        call.columns = columns;
        call.countOptions = options;
        return builder;
      },
      eq: (column, value) => {
        call.filters.push([column, value]);
        return builder;
      },
      order: (column, options) => {
        call.orders.push([column, options.ascending]);
        return builder;
      },
      range: (from, to) => {
        call.range = [from, to];
        return Promise.resolve({ data: rows, error: null });
      },
      delete: () => builder,
      in: (column, values) => {
        call.deleted = [column, values];
        return Promise.resolve({ error: null });
      },
      then: (resolve) =>
        resolve({ count: counts[call.filters[0]?.[1] ?? "total"] ?? 0, error: null }),
    };
    return builder;
  };
  const source = readFileSync(path.join(__dirname, "../src/api/products.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    Promise,
    require: (name) => (name === "@/lib/supabase" ? { supabase: { from: query } } : require(name)),
  });
  return { api: module.exports, calls };
}

test("ALL 목록은 저장일 순으로, 같은 시각이면 id 내림차순으로 한 페이지씩 가져온다", async () => {
  const { api, calls } = loadProductsApi([]);
  await api.fetchProductPage({ sort: "latest", wishLevel: null, page: 0 });
  await api.fetchProductPage({ sort: "oldest", wishLevel: null, page: 2 });
  assert.deepEqual(calls[0].orders, [
    ["saved_at", false],
    ["id", false],
  ]);
  assert.deepEqual(calls[1].orders, [
    ["saved_at", true],
    ["id", false],
  ]);
  assert.deepEqual(calls[0].range, [0, api.PRODUCT_PAGE_SIZE - 1]);
  assert.deepEqual(calls[1].range, [api.PRODUCT_PAGE_SIZE * 2, api.PRODUCT_PAGE_SIZE * 3 - 1]);
  assert.deepEqual(calls[0].filters, [], "필터가 없으면 소장 상품까지 모두 가져온다");
});

test("위시레벨 필터는 해당 레벨만 가져와 소장 상품(null)은 빠진다", async () => {
  const { api, calls } = loadProductsApi([]);
  await api.fetchProductPage({ sort: "latest", wishLevel: "high", page: 0 });
  assert.deepEqual(calls[0].filters, [["wish_level", "high"]]);
});

test("나의 소장템 폴더에 담긴 상품만 소장으로 표시하고 가격 null·0을 구분해 넘긴다", async () => {
  const { api } = loadProductsApi([
    {
      id: 1,
      name: "소장품",
      brand: null,
      price: null,
      image_url: null,
      product_folders: [{ folders: { kind: "custom" } }, { folders: { kind: "owned" } }],
    },
    {
      id: 2,
      name: "일반",
      brand: "브랜드",
      price: 0,
      image_url: "https://img.com/2.jpg",
      product_folders: [{ folders: { kind: "custom" } }],
    },
  ]);
  const items = await api.fetchProductPage({ sort: "latest", wishLevel: null, page: 0 });
  assert.deepEqual(
    items.map((item) => [item.id, item.isOwned, item.price, item.thumbnailUrl]),
    [
      ["1", true, null, null],
      ["2", false, 0, "https://img.com/2.jpg"],
    ],
  );
});

test("상단 개수는 전체와 레벨별 개수를 따로 센다", async () => {
  const { api, calls } = loadProductsApi([], { total: 12, high: 3, medium: 2, low: 1 });
  const result = await api.fetchProductCounts();
  assert.equal(result.total, 12);
  assert.deepEqual({ ...result.levels }, { high: 3, medium: 2, low: 1 });
  assert.ok(
    calls.every((call) => call.countOptions?.head === true),
    "개수만 받고 행은 받지 않는다",
  );
});

test("선택 삭제는 고른 상품 id를 숫자로 바꿔 한 번에 지운다", async () => {
  const { api, calls } = loadProductsApi();
  await api.deleteProducts(["3", "7"]);
  assert.equal(calls[0].deleted[0], "id");
  assert.deepEqual([...calls[0].deleted[1]], [3, 7]);
});
