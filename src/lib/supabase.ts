import "react-native-get-random-values";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as aesjs from "aes-js";
import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";

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
const APP_GROUP = "group.com.diggin.app.preview";
const sharedFolder = Platform.OS === "ios" ? Paths.appleSharedContainers[APP_GROUP] : undefined;
const sharedKeychain = sharedFolder ? { accessGroup: APP_GROUP } : undefined;

// SecureStore는 값 하나에 2KB까지만 저장해서 세션을 직접 넣을 수 없다.
// 세션은 암호화해 파일(iOS는 공유 폴더, 그 밖은 AsyncStorage)에 두고, 암호화 키만 SecureStore에 둔다(Supabase Expo 가이드).
class LargeSecureStore {
  private async encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey), sharedKeychain);
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(
    key: string,
    value: string,
    options: SecureStore.SecureStoreOptions | undefined = sharedKeychain,
  ) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key, options);
    if (!encryptionKeyHex) return encryptionKeyHex;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
  }

  private file(key: string) {
    return sharedFolder ? new File(sharedFolder, `${key}.session`) : null;
  }

  async getItem(key: string) {
    const file = this.file(key);
    if (!file) {
      const encrypted = await AsyncStorage.getItem(key);
      return encrypted ? this.decrypt(key, encrypted) : null;
    }
    if (file.exists) return this.decrypt(key, await file.text());
    // 공유 저장소 이전에 로그인한 세션을 한 번 옮겨, 업데이트로 로그아웃되지 않게 한다. 확장은 예전 위치를 읽을 수 없다.
    const legacy = await AsyncStorage.getItem(key);
    if (!legacy) return null;
    // 예전 키는 앱 전용 키체인에 있다. undefined를 넘기면 기본값(공유 그룹)이 쓰여 빈 옵션을 넘긴다.
    const value = await this.decrypt(key, legacy, {});
    if (value) await this.setItem(key, value);
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
    return value;
  }

  async removeItem(key: string) {
    const file = this.file(key);
    if (file?.exists) file.delete();
    await SecureStore.deleteItemAsync(key, sharedKeychain);
    await AsyncStorage.removeItem(key);
  }

  async setItem(key: string, value: string) {
    const encrypted = await this.encrypt(key, value);
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
