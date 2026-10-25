/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function loadTs(file) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { module, exports: module.exports, require },
  );
  return module.exports;
}
const itemLink = loadTs("../src/utils/itemLink.ts");

const LINK = "https://www.musinsa.com/products/1";
const FOLDERS = [{ id: "f1", name: "선물" }];
const VALUES = {
  name: "니트",
  brand: "",
  price: "",
  sourceUrl: LINK,
  thumbnailUrl: null,
  wishLevel: null,
};

function loadShareSave({
  session = null,
  error = null,
  rejects = false,
  existingId = null,
  saved,
} = {}) {
  const calls = {
    started: [],
    opened: [],
    kept: [],
    closed: 0,
    marked: 0,
    timers: [],
    toasts: [],
    saves: [],
    openedAfterLoading: 0,
  };
  const states = [];
  const refs = [];
  let cursor = 0;
  let refCursor = 0;
  let effects = [];
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(
      readFileSync(path.join(__dirname, "../src/screens/save/ShareSaveScreen.tsx"), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      },
    ).outputText,
    {
      module,
      exports: module.exports,
      setTimeout: (callback, ms) => calls.timers.push([callback, ms]),
      require: (name) => {
        if (name === "react")
          return {
            ...React,
            useState: (initial) => {
              const index = cursor++;
              if (!(index in states)) states[index] = initial;
              return [states[index], (value) => (states[index] = value)];
            },
            useRef: (initial) => refs[refCursor++] ?? (refs[refCursor - 1] = { current: initial }),
            useEffect: (callback) => {
              effects.push(callback);
            },
          };
        const mocks = {
          "@supabase/supabase-js": {
            isAuthRetryableFetchError: (value) => value?.retryable === true,
          },
          "@tanstack/react-query": { QueryClientProvider: "QueryClientProvider" },
          "expo-font": { useFonts: () => [true, null] },
          "expo-share-extension": {
            close: () => calls.closed++,
            openHostApp: (value) => calls.opened.push(value),
          },
          "react-native": { Text: "Text", View: "View" },
          "react-native-safe-area-context": { SafeAreaProvider: "SafeAreaProvider" },
          "@/api/products": { findProductIdByUrl: async () => existingId },
          "@/components/Loading": { Spinner: "Spinner" },
          "@/constants/messages": {
            TOAST_MESSAGES: { SAVE_011: "아이템을 저장했습니다.", SAVE_012: "저장 실패" },
          },
          "@/contexts/ToastContext": { ToastProvider: "ToastProvider" },
          "@/hooks/useItemSave": {
            EMPTY_ITEM_SAVE_VALUES: {},
            useItemSave: () => ({
              start: (url) => calls.started.push(url),
              isLoading: false,
              openAfterLoading: () => calls.openedAfterLoading++,
              values: VALUES,
              hasFailed: false,
              save: {
                isPending: false,
                isError: false,
                reset: () => {},
                mutateAsync: async (input) => {
                  calls.saves.push(input);
                  return saved ?? { productId: "9", isDuplicate: false };
                },
              },
            }),
          },
          "@/hooks/useToast": { useToast: () => (message) => calls.toasts.push(message) },
          "@/hooks/useFolders": { useFolders: () => ({ data: FOLDERS }) },
          "@/hooks/useCreateFolder": { useCreateFolder: () => ({ mutateAsync: async () => {} }) },
          "@/screens/item-detail/components/FolderManageSheet": {
            FolderManageSheet: "FolderManageSheet",
          },
          "@/lib/queryClient": { queryClient: {} },
          "@/lib/sharedSaves": { markSharedSave: () => calls.marked++ },
          "@/lib/pendingShareLink": { keepShareLink: (url) => calls.kept.push(url) },
          "@/lib/supabase": {
            supabase: {
              auth: {
                getSession: async () => {
                  if (rejects) throw new Error("offline");
                  return { data: { session }, error };
                },
              },
            },
          },
          "@/screens/item-detail/components/ItemEditSheet": { ItemEditSheet: "ItemEditSheet" },
          "@/screens/save/components/ProductPageReader": { ProductPageReader: "ProductPageReader" },
          "@/screens/save/components/ShareErrorSheet": { ShareErrorSheet: "ShareErrorSheet" },
          "@/utils/itemLink": itemLink,
          "@/assets/fonts/Pretendard-Regular.otf": 1,
          "@/assets/fonts/Pretendard-Medium.otf": 2,
          "@/assets/fonts/Pretendard-SemiBold.otf": 3,
          "@/assets/fonts/Pretendard-Bold.otf": 4,
        };
        return mocks[name] ?? require(name);
      },
    },
  );
  calls.shared = ["coupang://x", `쿠팡 ${LINK}`].join(" ");
  const ShareSave = module.exports.ShareSaveScreen;
  const render = (shared) => {
    cursor = 0;
    refCursor = 0;
    effects = [];
    return ShareSave({
      shared,
      onClose: () => calls.closed++,
      onLogin: (url) => {
        calls.kept.push(url);
        calls.opened.push("login");
      },
      onOpenItem: (id) => calls.opened.push(`items/${id}`),
    });
  };
  const run = async (shared) => {
    render(shared);
    effects.forEach((effect) => effect());
    await new Promise((resolve) => setImmediate(resolve));
    return render(shared);
  };
  const find = (tree, type) =>
    React.Children.toArray(tree.props.children).find((child) => child.type === type);
  return { run, render, find, calls };
}

test("쓸 수 없는 링크는 로그인을 확인하지 않고 오류 시트로 알린다", async () => {
  const { run, find, calls } = loadShareSave({ session: { user: { id: "u" } } });
  const view = await run("공유한 텍스트뿐");
  assert.equal(find(view, "ShareErrorSheet").props.reason, "no_url");
  assert.deepEqual(calls.started, []);
});

test("로그인돼 있으면 카드 안의 아이템 정보 수정에서 저장하고, 토스트 후 닫는다", async () => {
  const { run, render, find, calls } = loadShareSave({ session: { user: { id: "u" } } });
  const view = await run(`이거 봐 ${LINK}`);
  assert.deepEqual(calls.started, [LINK]);
  assert.ok(calls.openedAfterLoading > 0, "로딩 모달 없이 다 불러오면 바로 연다");
  const sheet = find(view, "ItemEditSheet");
  assert.equal(sheet.props.isInline, true, "모달을 또 올리지 않고 카드 안에 그린다");
  assert.equal(sheet.props.visible, true);
  assert.equal(sheet.props.submitLabel, "폴더 선택하기");
  await sheet.props.onSubmit(VALUES);
  assert.deepEqual(calls.saves, [], "폴더를 고르기 전에는 저장하지 않는다");
  assert.equal(find(render(LINK), "ItemEditSheet").props.visible, false);
  const folderSheet = find(render(LINK), "FolderManageSheet");
  assert.equal(folderSheet.props.isInline, true);
  assert.equal(folderSheet.props.title, "저장할 폴더 선택");
  await folderSheet.props.onComplete(["f1"]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(calls.saves)),
    [{ values: VALUES, folderIds: ["f1"] }],
    "고른 폴더에 저장한다",
  );
  assert.equal(calls.marked, 1, "앱이 돌아올 때 목록을 다시 불러오도록 남긴다");
  assert.deepEqual(calls.toasts, ["아이템을 저장했습니다."]);
  assert.equal(
    find(render(LINK), "FolderManageSheet").props.isCompleting,
    true,
    "닫힐 때까지 다시 저장하지 못한다",
  );
  assert.equal(calls.timers[0][1], 1500);
  calls.timers[0][0]();
  assert.equal(calls.closed, 1);
});

test("링크 칸이 앱 주소여도 글자 칸의 웹 링크로 저장한다", () => {
  const { calls } = loadShareSave();
  assert.equal(itemLink.classifyItemLink(calls.shared), null);
  assert.equal(itemLink.findItemLink(calls.shared), LINK);
});

test("이미 저장한 링크는 저장하지 않고 안내하며, 확인하면 앱에서 기존 아이템을 연다", async () => {
  const { run, render, find, calls } = loadShareSave({
    session: { user: { id: "u" } },
    existingId: "42",
  });
  await find(await run(LINK), "ItemEditSheet").props.onSubmit(VALUES);
  assert.deepEqual(calls.saves, []);
  const { duplicate } = find(render(LINK), "ItemEditSheet").props;
  duplicate.onConfirm();
  assert.deepEqual(calls.opened, ["items/42"]);
  duplicate.onDismiss();
  assert.equal(calls.closed, 1, "괜찮아요는 공유를 닫는다");
});

test("폴더를 고르는 사이 같은 링크가 저장됐으면 폴더 선택을 닫고 중복 안내를 띄운다", async () => {
  const { run, render, find } = loadShareSave({
    session: { user: { id: "u" } },
    saved: { productId: "43", isDuplicate: true },
  });
  await find(await run(LINK), "ItemEditSheet").props.onSubmit(VALUES);
  await find(render(LINK), "FolderManageSheet").props.onComplete(["f1"]);
  const view = render(LINK);
  assert.equal(find(view, "FolderManageSheet"), undefined);
  assert.equal(find(view, "ItemEditSheet").props.visible, true);
  assert.ok(find(view, "ItemEditSheet").props.duplicate);
});

test("로그인이 풀렸으면 링크는 앱과 확장만 쓰는 보관함에 맡기고, 주소에 싣지 않고 앱의 로그인으로 보낸다", async () => {
  const { run, calls } = loadShareSave({ error: { message: "invalid refresh token" } });
  await run(LINK);
  assert.deepEqual(calls.kept, [LINK]);
  assert.deepEqual(
    calls.opened,
    ["login"],
    "주소로 넘기면 다른 앱도 같은 주소로 링크를 넣을 수 있다",
  );
  assert.deepEqual(calls.started, []);
});

test("로그인 확인 중 연결이 끊기면 앱으로 보내지 않고 오류 시트로 알린다", async () => {
  for (const options of [{ error: { retryable: true } }, { rejects: true }]) {
    const { run, find, calls } = loadShareSave(options);
    const view = await run(LINK);
    assert.equal(find(view, "ShareErrorSheet").props.reason, "network");
    assert.deepEqual(calls.opened, []);
  }
});
