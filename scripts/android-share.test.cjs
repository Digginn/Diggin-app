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
  const calls = { routes: [], kept: [], cleared: 0, exited: 0, back: null };
  const { default: Route } = load("app/android-share.tsx", {
    "react": { ...React, useCallback: (callback) => callback, useEffect: (effect) => effect() },
    "expo-router": {
      Redirect: "Redirect",
      useLocalSearchParams: () => ({ receivedAt: "123" }),
      useRouter: () => ({ replace: (value) => calls.routes.push(value) }),
    },
    "expo-sharing": {
      getSharedPayloads: () => payloads,
      clearSharedPayloads: () => calls.cleared++,
    },
    "react-native": {
      Platform: { OS: os },
      BackHandler: {
        exitApp: () => calls.exited++,
        addEventListener: (_event, callback) => {
          calls.back = callback;
          return { remove() {} };
        },
      },
    },
    "@/lib/pendingShareLink": { keepShareLink: (url) => calls.kept.push(url) },
    "@/screens/save/ShareSaveScreen": { ShareSaveScreen: "ShareSaveScreen" },
  });
  return { calls, screen: Route() };
}

test("Android 공유는 네이티브 수신 값만 연결하고 텍스트·URL 외 파일은 제외한다", () => {
  const { screen } = route([
    { shareType: "text", value: "상품 제목" },
    { shareType: "url", value: "https://shop.example.com/1" },
    { shareType: "image", value: "file://private" },
  ]);
  assert.equal(screen.type, "ShareSaveScreen");
  assert.equal(screen.props.shared, "상품 제목 https://shop.example.com/1");
  assert.equal(screen.props.isInline, false, "편집 중 뒤로가기는 기존 모달이 처리한다");
  assert.equal(route([]).screen.props.shared, "", "URL 쿼리로 임의 저장 링크를 받지 않는다");
});

test("공유 취소·저장 완료는 수신 값을 지우고 원래 앱으로 돌아가며, 중복 확인은 기존 상품을 연다", () => {
  const h = route([]);
  h.screen.props.onClose();
  assert.equal(h.calls.cleared, 1);
  assert.equal(h.calls.exited, 1);
  assert.deepEqual(h.calls.routes, ["/(tabs)/all"]);
  const duplicate = route([]);
  duplicate.screen.props.onOpenItem("25");
  assert.equal(duplicate.calls.cleared, 1);
  assert.equal(duplicate.calls.exited, 0);
  assert.equal(duplicate.calls.routes[0].pathname, "/items/[id]");
  assert.equal(duplicate.calls.routes[0].params.id, "25");
  const back = route([]);
  assert.equal(back.calls.back(), true);
  assert.equal(back.calls.exited, 1);
});

test("비회원 공유는 링크를 보관하고 로그인으로 보내며 iOS에서는 공유 확장 진입을 유지한다", () => {
  const guest = route([]);
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
