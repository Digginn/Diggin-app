import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { APP_GROUP } from "@/constants/appGroup";
import { isItemLink } from "@/utils/itemLink";

// 오래 묵은 링크는 사용자가 잊은 공유라 로그인 뒤에 갑자기 저장 화면이 뜨지 않게 버린다.
const PENDING_SHARE_TTL_MS = 10 * 60 * 1000;

const folder =
  Platform.OS === "ios"
    ? Paths.appleSharedContainers[APP_GROUP]
    : Platform.OS === "android"
      ? Paths.document
      : undefined;
const pending = folder ? new File(folder, "pending-share") : null;

/**
 * SAVE-002 비회원이 공유한 링크를 앱 전용 저장소(iOS는 App Group)에 맡긴다.
 * diggin:// 주소에 실으면 다른 앱도 링크를 넣어 로그인 직후 그 페이지를 열게 할 수 있다.
 */
export function keepShareLink(url: string) {
  pending?.write(JSON.stringify({ url, savedAt: Date.now() }));
}

/** 로그인 뒤 한 번만 꺼내고 지운다. */
export async function takeShareLink() {
  if (!pending?.exists) return null;
  const text = await pending.text();
  pending.delete();
  try {
    const { url, savedAt }: { url?: unknown; savedAt?: unknown } = JSON.parse(text);
    const isFresh = typeof savedAt === "number" && Date.now() - savedAt <= PENDING_SHARE_TTL_MS;
    return typeof url === "string" && isItemLink(url) && isFresh ? url.trim() : null;
  } catch {
    return null;
  }
}

/** 로그인하지 않고 나가면 맡긴 링크를 버린다. */
export function discardShareLink() {
  if (pending?.exists) pending.delete();
}
