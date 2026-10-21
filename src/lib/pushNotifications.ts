import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

// 이 기기에서 등록한 토큰과 계정. 로그아웃할 때 지우고, 같은 계정이면 다시 등록하지 않는다.
let registered: { token: string; userId: string } | null = null;
// 응답을 기다리는 등록 요청 전부. 로그인 직후와 앱 복귀가 겹치면 여러 개일 수 있어,
// 로그아웃하면 모두 끝난 뒤에 지워야 늦게 도착한 요청이 토큰을 다시 남기지 않는다.
const pending = new Set<Promise<string | null>>();
// 로그아웃할 때마다 올려, 그 전에 시작한 등록이 토큰을 받은 뒤 이어서 등록하지 않게 한다.
let session = 0;
// 로그아웃 중에는 아직 로그인 상태라 앱 복귀로 등록이 다시 시작될 수 있어, 세션을 끊을 때까지 막는다.
// 로그아웃이 겹쳐도 모두 끝나야 풀리도록 진행 중인 수를 센다.
let signingOut = 0;

/**
 * NOTI-001 로그인한 기기의 Push 토큰을 등록한다. 권한이 아직 정해지지 않았고 shouldAsk면
 * 사전 안내 없이 OS 권한 창을 바로 띄운다. 허용되지 않았으면 아무것도 하지 않는다.
 */
export async function registerDevicePush(userId: string, shouldAsk: boolean) {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  if (signingOut > 0 || registered?.userId === userId) return;
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
  pending.add(current);
  try {
    const { error } = await request;
    if (error) throw error;
    if (startedSession === session) registered = { token, userId };
  } finally {
    pending.delete(current);
  }
}

/** 로그인 상태에서만 지울 수 있어 로그아웃 직전에 부른다. 실패해도 로그아웃은 막지 않는다. */
export async function unregisterDevicePush() {
  signingOut += 1;
  session += 1;
  const waiting = [...pending];
  const token = registered?.token;
  registered = null;
  const tokens = await Promise.all(waiting);
  const deleting = token ?? tokens.find((value) => value !== null);
  if (!deleting) return;
  const { error } = await supabase.from("push_tokens").delete().eq("token", deleting);
  if (error) console.warn("Push 토큰을 지우지 못했습니다.", error);
}

/** 로그아웃이 끝나면 부른다. 세션 종료에 실패해 로그인 상태가 남으면 다시 등록할 수 있게 한다. */
export function finishDeviceSignOut() {
  signingOut = Math.max(0, signingOut - 1);
}
