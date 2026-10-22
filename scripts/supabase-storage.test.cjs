/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");
const { webcrypto } = require("node:crypto");

const APP_GROUP = "group.com.diggin.app.preview";

function loadStorage(os) {
  const asyncStorage = new Map();
  const keychain = new Map();
  const files = new Map();
  let storage;
  const keychainKey = (key, options) => `${options?.accessGroup ?? "app"}:${key}`;
  class File {
    constructor(folder, name) {
      this.path = `${folder.path}/${name}`;
    }
    get exists() {
      return files.has(this.path);
    }
    async text() {
      return files.get(this.path);
    }
    write(value) {
      files.set(this.path, value);
    }
    delete() {
      files.delete(this.path);
    }
  }
  const compiled = ts.transpileModule(
    readFileSync(path.join(__dirname, "../src/lib/supabase.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
  ).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    crypto: webcrypto,
    process: {
      env: {
        EXPO_PUBLIC_SUPABASE_URL: "http://local",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "key",
      },
    },
    require: (name) => {
      if (name === "react-native-get-random-values") return {};
      if (name === "@/constants/appGroup") return { APP_GROUP };
      if (name === "react-native")
        return { Platform: { OS: os }, AppState: { addEventListener: () => {} } };
      if (name === "@react-native-async-storage/async-storage")
        return {
          __esModule: true,
          default: {
            getItem: async (key) => asyncStorage.get(key) ?? null,
            setItem: async (key, value) => asyncStorage.set(key, value),
            removeItem: async (key) => asyncStorage.delete(key),
          },
        };
      if (name === "expo-secure-store")
        return {
          getItemAsync: async (key, options) => keychain.get(keychainKey(key, options)) ?? null,
          setItemAsync: async (key, value, options) =>
            keychain.set(keychainKey(key, options), value),
          deleteItemAsync: async (key, options) => keychain.delete(keychainKey(key, options)),
        };
      if (name === "expo-file-system")
        return {
          File,
          Paths: {
            appleSharedContainers: os === "ios" ? { [APP_GROUP]: { path: "/shared" } } : {},
          },
        };
      if (name === "@supabase/supabase-js")
        return {
          createClient: (_url, _key, options) => {
            storage = options.auth.storage;
            return {};
          },
        };
      return require(name);
    },
  });
  return { storage, asyncStorage, keychain, files };
}

test("iOS는 세션을 공유 확장과 함께 쓰는 App Group 폴더와 키체인 그룹에 저장한다", async () => {
  const { storage, asyncStorage, keychain, files } = loadStorage("ios");
  await storage.setItem("sb-auth", '{"access_token":"a"}');
  assert.equal(asyncStorage.size, 0, "앱 전용 저장소에는 두지 않는다");
  assert.ok(files.has("/shared/sb-auth.session"));
  assert.ok(keychain.has(`${APP_GROUP}:sb-auth`), "암호화 키는 공유 키체인 그룹에 둔다");
  assert.notEqual(
    files.get("/shared/sb-auth.session"),
    '{"access_token":"a"}',
    "세션은 암호화해 둔다",
  );
  assert.equal(await storage.getItem("sb-auth"), '{"access_token":"a"}');

  await storage.removeItem("sb-auth");
  assert.equal(files.size, 0);
  assert.equal(keychain.size, 0);
  assert.equal(await storage.getItem("sb-auth"), null);
});

test("iOS에서 공유 저장소 전에 로그인한 세션은 한 번 옮기고 예전 위치에서 지운다", async () => {
  const legacy = loadStorage("android");
  await legacy.storage.setItem("sb-auth", '{"access_token":"old"}');
  const { storage, asyncStorage, keychain, files } = loadStorage("ios");
  for (const [key, value] of legacy.asyncStorage) asyncStorage.set(key, value);
  for (const [key, value] of legacy.keychain) keychain.set(key, value);

  assert.equal(
    await storage.getItem("sb-auth"),
    '{"access_token":"old"}',
    "업데이트 후에도 로그인이 유지된다",
  );
  assert.ok(files.has("/shared/sb-auth.session"));
  assert.ok(keychain.has(`${APP_GROUP}:sb-auth`));
  assert.equal(asyncStorage.size, 0, "예전 세션은 지운다");
  assert.equal(keychain.has("app:sb-auth"), false, "예전 키도 지운다");
  assert.equal(await storage.getItem("sb-auth"), '{"access_token":"old"}');
});

test("안드로이드는 지금처럼 AsyncStorage와 앱 키체인을 쓴다", async () => {
  const { storage, asyncStorage, keychain, files } = loadStorage("android");
  await storage.setItem("sb-auth", '{"access_token":"a"}');
  assert.ok(asyncStorage.has("sb-auth"));
  assert.ok(keychain.has("app:sb-auth"));
  assert.equal(files.size, 0);
  assert.equal(await storage.getItem("sb-auth"), '{"access_token":"a"}');
});
