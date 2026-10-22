/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");
const { webcrypto } = require("node:crypto");

const APP_GROUP = "group.com.diggin.app.preview";

// iOS 키체인처럼 서비스·그룹·키로 저장한다. 그룹을 주지 않은 조회·삭제는 앱이 쓸 수 있는 모든 그룹에서 찾는다.
const APP_ONLY_GROUP = "TEAMID.com.diggin.app.preview";
function createKeychain() {
  const items = new Map();
  const id = (service, group, key) => `${service}|${group}|${key}`;
  const matches = (key, options) => (entry) => {
    const [service, group, account] = entry.split("|");
    return (
      service === (options?.keychainService ?? "app") &&
      account === key &&
      (options?.accessGroup === undefined || group === options.accessGroup)
    );
  };
  return {
    items,
    has: (key, options) => [...items.keys()].some(matches(key, options)),
    getItemAsync: async (key, options) => {
      const found = [...items.keys()].find(matches(key, options));
      return found ? items.get(found) : null;
    },
    setItemAsync: async (key, value, options) => {
      items.set(
        id(options?.keychainService ?? "app", options?.accessGroup ?? APP_ONLY_GROUP, key),
        value,
      );
    },
    deleteItemAsync: async (key, options) => {
      for (const entry of [...items.keys()].filter(matches(key, options))) items.delete(entry);
    },
  };
}

function loadStorage(os, shared = {}) {
  const asyncStorage = shared.asyncStorage ?? new Map();
  const keychain = shared.keychain ?? createKeychain();
  const files = shared.files ?? new Map();
  const hooks = shared.hooks ?? {};
  let storage;
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
      hooks.beforeFileWrite?.();
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
          getItemAsync: keychain.getItemAsync,
          setItemAsync: async (key, value, options) => {
            await hooks.beforeKeyWrite?.();
            return keychain.setItemAsync(key, value, options);
          },
          deleteItemAsync: keychain.deleteItemAsync,
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
  return { storage, asyncStorage, keychain, files, hooks };
}

test("iOS는 세션을 공유 확장과 함께 쓰는 App Group 폴더와 키체인 그룹에 저장한다", async () => {
  const { storage, asyncStorage, keychain, files } = loadStorage("ios");
  await storage.setItem("sb-auth", '{"access_token":"a"}');
  assert.equal(asyncStorage.size, 0, "앱 전용 저장소에는 두지 않는다");
  assert.ok(files.has("/shared/sb-auth.session"));
  assert.ok(
    [...keychain.items.keys()].every((entry) => entry.includes(`|${APP_GROUP}|`)),
    "암호화 키는 공유 키체인 그룹에 둔다",
  );
  assert.notEqual(
    files.get("/shared/sb-auth.session"),
    '{"access_token":"a"}',
    "세션은 암호화해 둔다",
  );
  assert.equal(await storage.getItem("sb-auth"), '{"access_token":"a"}');

  await storage.removeItem("sb-auth");
  assert.equal(files.size, 0);
  assert.equal(keychain.items.size, 0);
  assert.equal(await storage.getItem("sb-auth"), null);
});

test("iOS에서 공유 저장소 전에 로그인한 세션은 한 번 옮기고, 다음 실행에도 로그인이 유지된다", async () => {
  const legacy = loadStorage("android");
  await legacy.storage.setItem("sb-auth", '{"access_token":"old"}');
  const { storage, asyncStorage, keychain, files } = loadStorage("ios", {
    asyncStorage: legacy.asyncStorage,
    keychain: legacy.keychain,
  });

  assert.equal(await storage.getItem("sb-auth"), '{"access_token":"old"}');
  assert.ok(files.has("/shared/sb-auth.session"));
  assert.equal(asyncStorage.size, 0, "예전 세션은 지운다");
  assert.ok(
    ![...keychain.items.keys()].some((entry) => entry.includes(`|${APP_ONLY_GROUP}|`)),
    "예전 키도 지운다",
  );
  const nextLaunch = loadStorage("ios", { asyncStorage, keychain, files });
  assert.equal(
    await nextLaunch.storage.getItem("sb-auth"),
    '{"access_token":"old"}',
    "예전 키를 지우다 공유 키까지 지우지 않는다",
  );
});

test("앱과 공유 확장이 같은 세션을 쓰는 중에 읽어도 깨진 값을 받지 않는다", async () => {
  const app = loadStorage("ios");
  const extension = loadStorage("ios", { keychain: app.keychain, files: app.files });
  await app.storage.setItem("sb-auth", '{"access_token":"a"}');
  assert.equal(await extension.storage.getItem("sb-auth"), '{"access_token":"a"}');

  const seen = [];
  const read = async () => seen.push(await extension.storage.getItem("sb-auth"));
  app.hooks.beforeKeyWrite = read;
  app.hooks.beforeFileWrite = () => void read();
  await app.storage.setItem("sb-auth", '{"access_token":"b"}');
  await new Promise((resolve) => setImmediate(resolve));
  for (const value of seen)
    assert.ok(['{"access_token":"a"}', '{"access_token":"b"}'].includes(value), value);
  assert.equal(await extension.storage.getItem("sb-auth"), '{"access_token":"b"}');
});

test("안드로이드는 지금처럼 AsyncStorage와 앱 키체인을 쓴다", async () => {
  const { storage, asyncStorage, keychain, files } = loadStorage("android");
  await storage.setItem("sb-auth", '{"access_token":"a"}');
  assert.ok(asyncStorage.has("sb-auth"));
  assert.ok(keychain.has("sb-auth", { accessGroup: APP_ONLY_GROUP }));
  assert.equal(files.size, 0);
  assert.equal(await storage.getItem("sb-auth"), '{"access_token":"a"}');
});
