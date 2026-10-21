import { supabase } from "@/lib/supabase";

export const notificationSettingKeys = {
  push: (viewer: string | null) => ["notification-settings", viewer] as const,
};

/** MY-011 Push 수신 여부. 설정한 적 없으면 켜져 있다. */
export async function fetchPushEnabled() {
  const { data, error } = await supabase.rpc("get_push_enabled");
  if (error) throw error;
  if (typeof data !== "boolean") throw new Error("invalid_push_setting_response");
  return data;
}

export async function savePushEnabled(enabled: boolean) {
  const { error } = await supabase.rpc("set_push_enabled", { enabled });
  if (error) throw error;
}
