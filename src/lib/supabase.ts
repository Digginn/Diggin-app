import "react-native-get-random-values";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as aesjs from "aes-js";
import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";

import { APP_GROUP } from "@/constants/appGroup";
import type { Database } from "@/types/database.types";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL과 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 .env에 넣어 주세요.",
  );
}

// iOS 공유 확장(#91)도 같은 세션을 쓰도록 앱과 확장이 함께 쓰는 App Group에 둔다.
// 세션을 복사하면 한쪽의 토큰 갱신이 다른 쪽 토큰을 무효로 만들어서, 같은 저장소를 함께 읽고 쓴다.
const sharedFolder = Platform.OS === "ios" ? Paths.appleSharedContainers[APP_GROUP] : undefined;
// iOS는 그룹 없이 지우면 모든 그룹에서 같은 서비스·키를 지운다. 예전 키를 지울 때 공유 키가 같이 지워지지 않게 서비스를 나눈다.
const sharedKeychain = sharedFolder
  ? { accessGroup: APP_GROUP, keychainService: "diggin.shared-session" }
  : undefined;

// SecureStore는 값 하나에 2KB까지만 저장해서 세션을 직접 넣을 수 없다.
// 세션은 암호화해 파일(iOS는 공유 폴더, 그 밖은 AsyncStorage)에 두고, 암호화 키만 SecureStore에 둔다(Supabase Expo 가이드).
// 파일은 한 번에 교체되지 않아 다른 쪽이 쓰는 중에 빈 값이나 앞부분만 읽을 수 있다. 덜 쓴 내용이면 잠깐 뒤 다시 읽는다.
const TORN_READ_RETRIES = 5;
const TORN_READ_DELAY_MS = 20;

type Sealed = { v: 2; iv: string; ct: string };

function parseSealed(value: string): Sealed | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "v" in parsed &&
      parsed.v === 2 &&
      "iv" in parsed &&
      typeof parsed.iv === "string" &&
      "ct" in parsed &&
      typeof parsed.ct === "string"
    ) {
      return { v: 2, iv: parsed.iv, ct: parsed.ct };
    }
  } catch {
    // 덜 쓴 JSON이거나 시작값을 저장하지 않던 예전 형식(16진 문자열)이다.
  }
  return null;
}

const isLegacyCipherText = (value: string) => /^(?:[0-9a-f]{2})+$/i.test(value);

class LargeSecureStore {
  // 앱 안에서 저장소 작업이 겹치면 처음 키를 두 번 만들 수 있어 한 줄로 세운다.
  private queue: Promise<unknown> = Promise.resolve();

  private exclusive<T>(task: () => Promise<T>) {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  // 앱과 확장이 같은 세션을 쓰니 키는 처음 만든 것을 계속 쓴다. 저장마다 바꾸면 키와 파일 사이에 끼어 읽은 쪽이 깨진다.
  private async encryptionKey(key: string) {
    const stored = await SecureStore.getItemAsync(key, sharedKeychain);
    if (stored) return aesjs.utils.hex.toBytes(stored);
    // 키는 앱 로그인 때 생긴다. 확장에서 키가 없으면 로그인 전이라 저장할 세션도 없어, 앱과 동시에 처음 키를 만들 일을 막는다.
    if (AppState.currentState === "extension") return null;
    const created = crypto.getRandomValues(new Uint8Array(256 / 8));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(created), sharedKeychain);
    return created;
  }

  private async encrypt(key: string, value: string) {
    const encryptionKey = await this.encryptionKey(key);
    if (!encryptionKey) return null;
    // 같은 키로 여러 번 저장하니 시작값을 매번 새로 만든다. CTR은 키와 시작값이 같으면 암호문끼리 내용이 드러난다.
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(iv));
    const sealed: Sealed = {
      v: 2,
      iv: aesjs.utils.hex.fromBytes(iv),
      ct: aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(value))),
    };
    return JSON.stringify(sealed);
  }

  private async decrypt(
    key: string,
    value: string,
    options: SecureStore.SecureStoreOptions | undefined = sharedKeychain,
  ) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key, options);
    if (!encryptionKeyHex) return encryptionKeyHex;
    const sealed = parseSealed(value);
    // 시작값을 저장하지 않던 예전 형식은 1에서 시작했다.
    const counter = new aesjs.Counter(sealed ? aesjs.utils.hex.toBytes(sealed.iv) : 1);
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      counter,
    );
    return aesjs.utils.utf8.fromBytes(
      cipher.decrypt(aesjs.utils.hex.toBytes(sealed ? sealed.ct : value)),
    );
  }

  private file(key: string) {
    return sharedFolder ? new File(sharedFolder, `${key}.session`) : null;
  }

  private async readComplete(file: File) {
    for (let attempt = 0; ; attempt += 1) {
      const text = await file.text();
      if (parseSealed(text) || isLegacyCipherText(text) || attempt >= TORN_READ_RETRIES) {
        return text;
      }
      await new Promise((resolve) => setTimeout(resolve, TORN_READ_DELAY_MS));
    }
  }

  getItem(key: string) {
    return this.exclusive(() => this.read(key));
  }

  setItem(key: string, value: string) {
    return this.exclusive(() => this.write(key, value));
  }

  removeItem(key: string) {
    return this.exclusive(async () => {
      const file = this.file(key);
      if (file?.exists) file.delete();
      await SecureStore.deleteItemAsync(key, sharedKeychain);
      await AsyncStorage.removeItem(key);
    });
  }

  private async read(key: string) {
    const file = this.file(key);
    if (!file) {
      const encrypted = await AsyncStorage.getItem(key);
      return encrypted ? this.decrypt(key, encrypted) : null;
    }
    if (file.exists) return this.decrypt(key, await this.readComplete(file));
    // 공유 저장소 이전에 로그인한 세션을 한 번 옮겨, 업데이트로 로그아웃되지 않게 한다. 확장은 예전 위치를 읽을 수 없다.
    const legacy = await AsyncStorage.getItem(key);
    if (!legacy) return null;
    // 예전 키는 앱 전용 키체인에 있다. undefined를 넘기면 기본값(공유 그룹)이 쓰여 빈 옵션을 넘긴다.
    const value = await this.decrypt(key, legacy, {});
    if (value) await this.write(key, value);
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
    return value;
  }

  private async write(key: string, value: string) {
    const encrypted = await this.encrypt(key, value);
    if (!encrypted) return;
    const file = this.file(key);
    if (file) file.write(encrypted);
    else await AsyncStorage.setItem(key, encrypted);
  }
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  // 클라이언트 자체 재시도(1·2·4초)가 TanStack Query 재시도와 겹쳐 실패 화면이 17초 걸렸다. 재시도는 queryClient에서만 한다.
  db: { retry: false },
  auth: {
    // 웹은 SecureStore가 없어 기본 저장소를 쓴다.
    storage: Platform.OS === "web" ? undefined : new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // 카카오는 브라우저 로그인 후 code를 딥링크로 받아 교환한다.
    flowType: "pkce",
  },
});

// 앱이 백그라운드에 있으면 토큰 자동 갱신을 멈추고, 돌아오면 다시 켠다.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
