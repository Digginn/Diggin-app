/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

function load(file, mocks) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "../src", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      URL,
      exports: module.exports,
      require: (name) => (name in mocks ? mocks[name] : require(name)),
    },
  );
  return module.exports;
}

function route(payloads, os = "android") {
  const calls = { routes: [], kept: [], read: 0, cleared: 0, exited: 0, back: null };
  let nativePayloads = payloads;
  let receivedAt = "123";
  let cursor = 0;
  const hooks = [];
  const effects = [];
  const router = { replace: (value) => calls.routes.push(value) };
  const { default: Route } = load("app/android-share.tsx", {
    "react": {
      ...React,
      useCallback: (callback) => callback,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = initial;
        return [hooks[index], (value) => (hooks[index] = value)];
      },
      useRef: (initial) => {
        const index = cursor++;
        return (hooks[index] ??= { current: initial });
      },
      useEffect: (effect, deps) => {
        const index = cursor++;
        const previous = hooks[index];
        if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
        effects.push(() => {
          previous?.cleanup?.();
          hooks[index] = { deps, effect, cleanup: effect() };
        });
      },
    },
    "expo-router": {
      Redirect: "Redirect",
      useLocalSearchParams: () => ({ receivedAt }),
      useRouter: () => router,
    },
    "expo-sharing": {
      getSharedPayloads: () => {
        calls.read++;
        return nativePayloads;
      },
      clearSharedPayloads: () => {
        calls.cleared++;
        nativePayloads = [];
      },
    },
    "react-native": {
      Platform: { OS: os },
      BackHandler: {
        exitApp: () => calls.exited++,
        addEventListener: (_event, callback) => {
          calls.back = callback;
          return {
            remove() {
              calls.back = null;
            },
          };
        },
      },
    },
    "@/lib/pendingShareLink": { keepShareLink: (url) => calls.kept.push(url) },
    "@/screens/save/ShareSaveScreen": { ShareSaveScreen: "ShareSaveScreen" },
  });
  const h = {
    calls,
    screen: null,
    render() {
      cursor = 0;
      h.screen = Route();
      effects.splice(0).forEach((effect) => effect());
      return h.screen;
    },
    receive(next, key) {
      nativePayloads = next;
      receivedAt = key;
      h.render();
      h.render();
    },
    replayEffects() {
      for (const hook of hooks) {
        if (hook?.effect) {
          hook.cleanup?.();
          hook.cleanup = hook.effect();
        }
      }
    },
  };
  h.render();
  h.render();
  return h;
}
const sharedLink = [{ shareType: "url", value: "https://shop.example.com/1" }];

test("Android 공유는 네이티브 수신 값만 연결하고 텍스트·URL 외 파일은 제외한다", () => {
  const { screen } = route([
    { shareType: "text", value: "상품 제목" },
    { shareType: "url", value: "https://shop.example.com/1" },
    { shareType: "image", value: "file://private" },
  ]);
  assert.equal(screen.type, "ShareSaveScreen");
  assert.equal(screen.props.shared, "상품 제목 https://shop.example.com/1");
  assert.equal(screen.props.isInline, false, "편집 중 뒤로가기는 기존 모달이 처리한다");
  const empty = route([]);
  assert.equal(empty.screen.type, "Redirect", "공유 없이 주소만 열면 ALL로 보낸다");
  assert.equal(empty.screen.props.href, "/(tabs)/all");
  assert.equal(empty.calls.exited, 0);
  assert.equal(empty.calls.back, null, "공유가 없으면 뒤로가기 종료 리스너도 붙이지 않는다");
});

test("공유 값은 즉시 한 번 소비하고 다시 렌더해도 유지하며 새 공유만 교체한다", () => {
  const h = route(sharedLink);
  assert.equal(h.calls.read, 1);
  assert.equal(h.calls.cleared, 1);
  const key = h.screen.key;
  h.replayEffects();
  h.render();
  assert.equal(h.calls.read, 1);
  assert.equal(h.screen.props.shared, sharedLink[0].value);
  assert.equal(h.screen.key, key, "네이티브 값을 지워도 저장 화면 key가 바뀌지 않는다");
  h.receive([{ shareType: "text", value: "https://shop.example.com/2" }], "124");
  assert.equal(h.calls.read, 2);
  assert.equal(h.calls.cleared, 2);
  assert.equal(h.screen.props.shared, "https://shop.example.com/2");
  h.receive([], "125");
  assert.equal(h.screen.type, "Redirect", "이후 딥링크가 이전 공유를 다시 열지 못한다");
  assert.equal(h.calls.exited, 0);
});

test("공유 취소·저장 완료는 수신 값을 지우고 원래 앱으로 돌아가며, 중복 확인은 기존 상품을 연다", () => {
  const h = route(sharedLink);
  h.screen.props.onClose();
  assert.equal(h.calls.cleared, 1);
  assert.equal(h.calls.exited, 1);
  assert.deepEqual(h.calls.routes, ["/(tabs)/all"]);
  const duplicate = route(sharedLink);
  duplicate.screen.props.onOpenItem("25");
  assert.equal(duplicate.calls.cleared, 1);
  assert.equal(duplicate.calls.exited, 0);
  assert.equal(duplicate.calls.routes[0].pathname, "/items/[id]");
  assert.equal(duplicate.calls.routes[0].params.id, "25");
  const back = route(sharedLink);
  assert.equal(back.calls.back(), true);
  assert.equal(back.calls.exited, 1);
});

test("비회원 공유는 링크를 보관하고 로그인으로 보내며 iOS에서는 공유 확장 진입을 유지한다", () => {
  const guest = route(sharedLink);
  guest.screen.props.onLogin("https://shop.example.com/1");
  assert.deepEqual(guest.calls.kept, ["https://shop.example.com/1"]);
  assert.deepEqual(guest.calls.routes, ["/login"]);
  assert.equal(guest.calls.cleared, 1);
  assert.equal(guest.calls.exited, 0);
  assert.equal(route([], "ios").screen.type, "Redirect");
});

test("native intent는 Android 공유 진입만 변환하고 일반 딥링크·iOS·상대 경로를 유지한다", () => {
  for (const os of ["android", "ios"]) {
    const { redirectSystemPath } = load("app/+native-intent.ts", {
      "react-native": { Platform: { OS: os } },
    });
    const path = "diggin://expo-sharing";
    const result = redirectSystemPath({ path, initial: true });
    assert.equal(
      os === "android" ? /^\/android-share\?receivedAt=\d+$/.test(result) : result === path,
      true,
    );
    for (const other of ["diggin://login", "/all", "https://expo-sharing?url=bad", "garbage"]) {
      assert.equal(redirectSystemPath({ path: other, initial: false }), other);
    }
  }
});

test("Android 로그인 대기 링크는 앱 전용 저장소에서 한 번만 읽고 취소 시 버린다", async () => {
  const files = new Map();
  class File {
    constructor(folder, name) {
      this.path = folder.path + "/" + name;
    }
    get exists() {
      return files.has(this.path);
    }
    write(value) {
      files.set(this.path, value);
    }
    async text() {
      return files.get(this.path);
    }
    delete() {
      files.delete(this.path);
    }
  }
  const itemLink = load("utils/itemLink.ts", {});
  const pending = load("lib/pendingShareLink.ts", {
    "expo-file-system": {
      File,
      Paths: { document: { path: "/private" }, appleSharedContainers: {} },
    },
    "react-native": { Platform: { OS: "android" } },
    "@/constants/appGroup": { APP_GROUP: "group.com.diggin.app.preview" },
    "@/utils/itemLink": itemLink,
  });
  pending.keepShareLink("https://shop.example.com/1");
  assert.equal(await pending.takeShareLink(), "https://shop.example.com/1");
  assert.equal(await pending.takeShareLink(), null);
  pending.keepShareLink("https://shop.example.com/2");
  pending.discardShareLink();
  assert.equal(await pending.takeShareLink(), null);
});
