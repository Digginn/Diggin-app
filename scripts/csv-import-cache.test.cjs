/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const { QueryClient, QueryObserver } = require("@tanstack/react-query");
const ts = require("typescript");

const LOGIN_SOURCES = {
  "@/lib/loginIntent": "../src/lib/loginIntent.ts",
  "@/hooks/useLoginGate": "../src/hooks/useLoginGate.tsx",
};

function load(file, mocks) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) =>
        mocks[name] ?? (LOGIN_SOURCES[name] ? load(LOGIN_SOURCES[name], mocks) : require(name)),
    },
  );
  return module.exports;
}

const { productKeys } = load("../src/api/products.ts", { "@/lib/supabase": {} });

function importer(client, run) {
  return load("../src/screens/my/hooks/useImportCsv.ts", {
    "@tanstack/react-query": { useQueryClient: () => client },
    "react": { useCallback: (callback) => callback },
    "@/api/products": { productKeys },
    "../api/importCsv": { importCsv: run },
  }).useImportCsv();
}

function member(Route) {
  const content = Route().props.children;
  return content.type(content.props);
}

test("CSV 완료 후 ALL·개수·폴더 목록/상품/관계는 재조회하고 다른 캐시는 유지한다", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  let stored = false;
  const keys = [
    productKeys.list("latest", null),
    productKeys.list("oldest", "high", "신발"),
    productKeys.counts(),
    productKeys.detail("1"),
    ["folders", "list"],
    ["folders", "items", "1", "latest", null, ""],
    ["folders", "counts", "1"],
    ["folders", "of-product", "1"],
  ];
  const observers = [];
  const unsubscribe = [];
  try {
    for (const queryKey of keys) {
      const queryFn = async () => (stored ? "after import" : "before import");
      await client.fetchQuery({ queryKey, queryFn });
      const observer = new QueryObserver(client, { queryKey, queryFn });
      observers.push(observer);
      unsubscribe.push(observer.subscribe(() => {}));
    }
    const inactiveKey = ["folders", "items", "2", "latest", null, ""];
    await client.fetchQuery({ queryKey: inactiveKey, queryFn: async () => "before import" });
    client.setQueryData(["notifications"], "unchanged");
    const progress = () => {};
    const file = { name: "wishlist.csv" };
    // 신규 0개여도 기존 상품에 폴더·소장 관계가 추가될 수 있다.
    const result = { importedCount: 0, excludedProducts: [], folderFailures: [] };
    const run = importer(client, async (asset, onProgress) => {
      assert.equal(asset, file);
      assert.equal(onProgress, progress);
      for (const key of keys) assert.equal(client.getQueryData(key), "before import");
      stored = true;
      return result;
    });
    assert.equal(await run(file, progress), result);
    for (const key of keys) assert.equal(client.getQueryData(key), "after import");
    assert.equal(client.getQueryState(inactiveKey).isInvalidated, true);
    assert.equal(client.getQueryData(["notifications"]), "unchanged");
    // 닫혀 있던 폴더도 다시 열면 staleTime과 무관하게 새 데이터를 가져온다.
    const inactiveObserver = new QueryObserver(client, {
      queryKey: inactiveKey,
      queryFn: async () => "after import",
    });
    observers.push(inactiveObserver);
    await new Promise((resolve) => {
      unsubscribe.push(
        inactiveObserver.subscribe((value) => {
          if (value.data === "after import") resolve();
        }),
      );
    });
    assert.equal(client.getQueryData(inactiveKey), "after import");
  } finally {
    unsubscribe.forEach((stop) => stop());
    observers.forEach((observer) => observer.destroy());
    client.clear();
  }
});

test("CSV 검증 실패·서버 오류는 성공으로 처리하거나 캐시를 갱신하지 않는다", async () => {
  for (const failsWithException of [false, true, "cancel"]) {
    const client = new QueryClient();
    try {
      client.setQueryData(productKeys.counts(), "before import");
      client.setQueryData(["folders", "list"], "before import");
      const error = new Error("network");
      const result = failsWithException === "cancel" ? null : { error: "missing-product-info" };
      const run = importer(client, async () => {
        if (failsWithException === true) throw error;
        return result;
      });
      if (failsWithException === true) await assert.rejects(() => run({}, () => {}), error);
      else assert.equal(await run({}, () => {}), result);
      assert.equal(client.getQueryState(productKeys.counts()).isInvalidated, false);
      assert.equal(client.getQueryState(["folders", "list"]).isInvalidated, false);
    } finally {
      client.clear();
    }
  }
});

test("CSV 라우트는 캐시 갱신이 포함된 가져오기 콜백을 화면에 전달한다", () => {
  const callback = () => {};
  const { default: Route } = load("../src/app/csv-import.tsx", {
    "@/screens/my/hooks/useImportCsv": { useImportCsv: () => callback },
    "@/screens/my/CsvImportScreen": { CsvImportScreen: "CsvImportScreen" },
    "@/components/MemberOnly": { MemberOnly: "MemberOnly" },
  });
  assert.equal(member(Route).props.onSelectCsv, callback);
});
