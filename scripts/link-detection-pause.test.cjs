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

function loadDetectedLink(
  pause,
  clipboardText,
  {
    isModalBusy = () => false,
    reads = [],
    pasteboard = null,
    clipboardUrl = null,
    storage = {},
  } = {},
) {
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
      getUrlAsync: async () => clipboardUrl,
    },
    "@react-native-async-storage/async-storage": {
      __esModule: true,
      default: {
        getItem: async (key) => storage[key] ?? null,
        setItem: async (key, value) => {
          storage[key] = value;
        },
      },
    },
    "@/hooks/useLinkDetectionPause": pause,
    "@/hooks/useNativeModalVisible": { isNativeModalBusy: () => isModalBusy() },
    "@/utils/itemLink": { findItemLink: (text) => (text.startsWith("https://") ? text : null) },
    "../../modules/diggin-pasteboard": { DigginPasteboard: pasteboard },
  });
  const render = () => {
    cursor = 0;
    return detected.useDetectedLink();
  };
  const check = async () => {
    render();
    effects.at(-1)();
    // 진입 확인은 저장소·클립보드를 차례로 기다린다. 끝날 때까지 몇 틱 기다린다.
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    return state[0]?.url ?? null;
  };
  return {
    check,
    render,
    isDetected: () => state[0] !== null,
    markLinkHandled: detected.markLinkHandled,
    retryAfterSettings: detected.retryAfterSettings,
    needsPasteGuide: () => state[1],
  };
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
  assert.equal(http.needsPasteGuide(), false);

  const https = loadDetectedLink(pause, "https://zigzag.kr/catalog/products/4");
  assert.equal(await https.check(), "https://zigzag.kr/catalog/products/4");
  assert.equal(https.needsPasteGuide(), false, "읽기에 성공하면(허용 설정) 안내를 띄우지 않는다");
});

function fakePasteboard(value, { delay = 0, hasWebUrl = true } = {}) {
  const pasteboard = {
    changeCount: 1,
    reads: 0,
    value,
    getChangeCount() {
      return this.changeCount;
    },
    hasWebUrlAsync: async () => hasWebUrl,
    // 진입 시 메인 스레드에서 읽는다. '묻기'면 여기서 iOS 팝업이 뜬다.
    readLinkTextAsync: () => {
      pasteboard.reads++;
      return new Promise((resolve) => setTimeout(() => resolve(pasteboard.value), delay));
    },
  };
  return pasteboard;
}

const pauseNone = () =>
  load("../src/hooks/useLinkDetectionPause.ts", { react: { useEffect: () => {} } });

test("iOS는 진입 시 읽어 https일 때만 감지 모달을 띄우고, 불러오기는 다시 읽지 않는다", async () => {
  const url = "https://zigzag.kr/catalog/products/5";
  const pasteboard = fakePasteboard(url);
  const linkDetection = loadDetectedLink(pauseNone(), "", { pasteboard });
  await linkDetection.check();
  assert.equal(linkDetection.isDetected(), true);
  assert.equal(pasteboard.reads, 1, "진입 시 한 번 읽는다");
  assert.equal(await linkDetection.render().readLink(), url);
  assert.equal(pasteboard.reads, 1, "불러오기에서 팝업이 다시 뜨지 않는다");
});

test("iOS에서 http 링크는 감지 모달을 띄우지 않고 같은 복사로 다시 읽지 않는다(SAVE-017)", async () => {
  const pasteboard = fakePasteboard("http://zigzag.kr/catalog/products/6");
  pasteboard.changeCount = 10;
  const linkDetection = loadDetectedLink(pauseNone(), "", { pasteboard });
  await linkDetection.check();
  assert.equal(linkDetection.isDetected(), false);
  assert.equal(linkDetection.needsPasteGuide(), false, "안내도 띄우지 않는다");
  await linkDetection.check();
  assert.equal(pasteboard.reads, 1, "같은 복사로 팝업을 다시 띄우지 않는다");
});

test("iOS에서 웹 링크가 없으면 읽지 않아 팝업도 띄우지 않는다", async () => {
  const pasteboard = fakePasteboard("메모", { hasWebUrl: false });
  const linkDetection = loadDetectedLink(pauseNone(), "", { pasteboard });
  await linkDetection.check();
  assert.equal(pasteboard.reads, 0);
  assert.equal(linkDetection.isDetected(), false);
});

test("iOS에서 붙여넣기를 거부하면 안내를 띄우고, 이번 실행 동안 같은 복사로 다시 묻지 않으며 재실행하면 다시 묻는다", async () => {
  const url = "https://zigzag.kr/catalog/products/10";
  const pasteboard = fakePasteboard("");
  pasteboard.changeCount = 50;
  const storage = {};
  const linkDetection = loadDetectedLink(pauseNone(), "", { pasteboard, storage });
  await linkDetection.check();
  assert.equal(linkDetection.isDetected(), false);
  assert.equal(linkDetection.needsPasteGuide(), true);
  await linkDetection.check();
  assert.equal(pasteboard.reads, 1, "같은 실행에서는 다시 묻지 않는다");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(storage, {}, "거부는 기기에 남기지 않는다");

  pasteboard.value = url;
  const relaunched = loadDetectedLink(pauseNone(), "", { pasteboard, storage });
  await relaunched.check();
  assert.equal(relaunched.isDetected(), true, "앱을 다시 켜면 다시 묻는다");
});

test("iOS에서 답한 복사는 앱을 다시 켜도 묻지 않고, 새로 복사하면 묻는다", async () => {
  const url = "https://zigzag.kr/catalog/products/8";
  const storage = {};
  const pasteboard = fakePasteboard(url);
  pasteboard.changeCount = 30;
  const first = loadDetectedLink(pauseNone(), "", { pasteboard, storage });
  await first.check();
  first.render().handle(null);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const relaunched = loadDetectedLink(pauseNone(), "", { pasteboard, storage });
  await relaunched.check();
  assert.equal(relaunched.isDetected(), false);
  pasteboard.changeCount = 31;
  await relaunched.check();
  assert.equal(relaunched.isDetected(), true);
});

test("묻기 팝업을 거쳐 읽었으면(오래 걸림) 안내 조건을 켜고, 허용처럼 바로 읽히면 켜지 않는다", async () => {
  const url = "https://zigzag.kr/catalog/products/11";
  for (const [delay, expected] of [
    [0, false],
    [400, true],
  ]) {
    const pasteboard = fakePasteboard(url, { delay });
    pasteboard.changeCount = 60 + delay;
    const linkDetection = loadDetectedLink(pauseNone(), "", { pasteboard });
    await linkDetection.check();
    await new Promise((resolve) => setTimeout(resolve, delay + 10));
    assert.equal(linkDetection.isDetected(), true);
    assert.equal(linkDetection.needsPasteGuide(), expected, `${delay}ms`);
  }
});

test("네이티브 읽기가 없는 빌드는 expo-clipboard로 읽고 URL 형식 복사도 읽는다", async () => {
  const url = "https://zigzag.kr/catalog/products/7";
  const pasteboard = { ...fakePasteboard(url), readLinkTextAsync: undefined };
  pasteboard.changeCount = 20;
  const linkDetection = loadDetectedLink(pauseNone(), "", { pasteboard, clipboardUrl: url });
  await linkDetection.check();
  assert.equal(linkDetection.isDetected(), true);
  assert.equal(await linkDetection.render().readLink(), url);
});

test("iOS도 다른 모달이 떠 있으면 읽지 않아 팝업을 띄우지 않는다", async () => {
  let busy = true;
  const pasteboard = fakePasteboard("https://zigzag.kr/catalog/products/13");
  pasteboard.changeCount = 80;
  const linkDetection = loadDetectedLink(pauseNone(), "", { pasteboard, isModalBusy: () => busy });
  await linkDetection.check();
  assert.equal(pasteboard.reads, 0);
  busy = false;
  await linkDetection.check();
  assert.equal(linkDetection.isDetected(), true);
});

test("거부 후 안내에서 설정으로 이동해 허용하고 돌아오면 같은 복사를 다시 읽어 감지 모달을 띄운다", async () => {
  const url = "https://zigzag.kr/catalog/products/14";
  const pasteboard = fakePasteboard("");
  pasteboard.changeCount = 90;
  const linkDetection = loadDetectedLink(pauseNone(), "", { pasteboard });
  await linkDetection.check();
  assert.equal(linkDetection.isDetected(), false);
  linkDetection.retryAfterSettings();
  pasteboard.value = url;
  await linkDetection.check();
  assert.equal(linkDetection.isDetected(), true, "설정에서 돌아오면 같은 복사로 불러온다");
  assert.equal(await linkDetection.render().readLink(), url);
});
