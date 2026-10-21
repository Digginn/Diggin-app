import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

// 이 기기에서 등록한 토큰과 계정. 로그아웃할 때 지우고, 같은 계정이면 다시 등록하지 않는다.
let registered: { token: string; userId: string } | null = null;
// 등록 응답을 기다리는 토큰. 그 사이 로그아웃하면 응답을 기다렸다가 지운다.
let pending: Promise<string | null> | null = null;
// 로그아웃할 때마다 올려, 그 전에 시작한 등록이 토큰을 받은 뒤 이어서 등록하지 않게 한다.
let session = 0;

/**
 * NOTI-001 로그인한 기기의 Push 토큰을 등록한다. 권한이 아직 정해지지 않았고 shouldAsk면
 * 사전 안내 없이 OS 권한 창을 바로 띄운다. 허용되지 않았으면 아무것도 하지 않는다.
 */
export async function registerDevicePush(userId: string, shouldAsk: boolean) {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  if (registered?.userId === userId) return;
  const startedSession = session;
  // 안드로이드 13+는 알림 채널이 있어야 권한 창이 뜬다.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "기본",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status === "undetermined" && shouldAsk) {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  });
  if (startedSession !== session) return;
  // 같은 기기에서 계정을 바꿔 로그인하면 서버가 토큰을 새 계정으로 옮긴다.
  const request = Promise.resolve(
    supabase.rpc("register_push_token", { new_token: token, new_platform: Platform.OS }),
  );
  const current = request.then(({ error }) => (error ? null : token)).catch(() => null);
  pending = current;
  try {
    const { error } = await request;
    if (error) throw error;
    if (startedSession === session) registered = { token, userId };
  } finally {
    if (pending === current) pending = null;
  }
}

/** 로그인 상태에서만 지울 수 있어 로그아웃 직전에 부른다. 실패해도 로그아웃은 막지 않는다. */
export async function unregisterDevicePush() {
  session += 1;
  const token = registered?.token ?? (await pending);
  registered = null;
  pending = null;
  if (!token) return;
  const { error } = await supabase.from("push_tokens").delete().eq("token", token);
  if (error) console.warn("Push 토큰을 지우지 못했습니다.", error);
}
