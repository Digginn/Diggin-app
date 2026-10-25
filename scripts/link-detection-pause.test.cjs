const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(file, mocks) {
  const compiled = ts.transpileModule(readFileSync(path.join(__dirname, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    Promise,
    require: (name) => mocks[name] ?? require(name),
  });
  return module.exports;
}

function loadDetectedLink(pause, clipboardText, { isModalBusy = () => false, reads = [] } = {}) {
  const state = [];
  let cursor = 0;
  const effects = [];
  const detected = load("../src/hooks/useDetectedLink.ts", {
    "react": {
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => (state[index] = value)];
      },
      useRef: (initial) => ({ current: initial }),
      useCallback: (callback) => callback,
      useEffect: (callback) => effects.push(callback),
    },
    "react-native": {
      AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
    },
    "expo-clipboard": {
      hasStringAsync: async () => true,
      getStringAsync: async () => {
        reads.push(clipboardText);
        return clipboardText;
      },
    },
    "@/hooks/useLinkDetectionPause": pause,
    "@/hooks/useNativeModalVisible": { isNativeModalBusy: () => isModalBusy() },
    "@/utils/itemLink": { findItemLink: (text) => (text.startsWith("https://") ? text : null) },
  });
  const check = async () => {
    cursor = 0;
    detected.useDetectedLink();
    effects.at(-1)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return state[0];
  };
  return { check, markLinkHandled: detected.markLinkHandled, hasReadClipboard: () => state[1] };
}

test("시트가 떠 있는 동안 본 링크는 묻지 않되 기록하지 않아서, 시트를 닫고 돌아오면 다시 묻는다", async () => {
  let effect;
  const pause = load("../src/hooks/useLinkDetectionPause.ts", {
    react: { useEffect: (callback) => (effect = callback) },
  });
  pause.useLinkDetectionPause(true);
  const release = effect();
  const url = "https://zigzag.kr/catalog/products/1";
  const { check } = loadDetectedLink(pause, url);

  assert.equal(await check(), null, "시트가 떠 있는 동안에는 감지 모달을 띄우지 않는다");
  release();
  assert.equal(await check(), url, "시트를 닫은 뒤 앱으로 돌아오면 같은 링크를 다시 묻는다");
});

test("불러오기를 시작한 링크는 같은 앱 실행 동안 다시 묻지 않는다", async () => {
  const pause = load("../src/hooks/useLinkDetectionPause.ts", { react: { useEffect: () => {} } });
  const url = "https://zigzag.kr/catalog/products/2";
  const { check, markLinkHandled } = loadDetectedLink(pause, url);
  markLinkHandled(url);
  assert.equal(await check(), null);
});

test("다른 모달이 떠 있거나 닫히는 중이면 클립보드를 읽지 않아 붙여넣기 팝업도 띄우지 않는다", async () => {
  const pause = load("../src/hooks/useLinkDetectionPause.ts", { react: { useEffect: () => {} } });
  const url = "https://zigzag.kr/catalog/products/3";
  let isModalBusy = true;
  const reads = [];
  const { check } = loadDetectedLink(pause, url, { isModalBusy: () => isModalBusy, reads });

  assert.equal(await check(), null);
  assert.deepEqual(reads, [], "모달이 떠 있으면 읽지 않는다");
  isModalBusy = false;
  assert.equal(await check(), url, "모달이 닫힌 뒤 돌아오면 묻는다");
});

test("https 링크가 없으면 붙여넣기 안내 조건을 켜지 않는다", async () => {
  const pause = load("../src/hooks/useLinkDetectionPause.ts", { react: { useEffect: () => {} } });
  const http = loadDetectedLink(pause, "http://zigzag.kr/catalog/products/4");
  assert.equal(await http.check(), null);
  assert.equal(http.hasReadClipboard(), false);

  const https = loadDetectedLink(pause, "https://zigzag.kr/catalog/products/4");
  assert.equal(await https.check(), "https://zigzag.kr/catalog/products/4");
  assert.equal(https.hasReadClipboard(), true);
});
