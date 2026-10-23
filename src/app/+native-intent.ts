import { Platform } from "react-native";

/** Android ACTION_SEND는 네이티브 공유 저장소에서만 내용을 읽는다. URL의 쿼리는 저장 링크로 쓰지 않는다. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path);
    if (
      Platform.OS === "android" &&
      url.protocol === "diggin:" &&
      url.hostname === "expo-sharing"
    ) {
      return `/android-share?receivedAt=${Date.now()}`;
    }
  } catch {
    // Router가 넘기는 기존 상대 경로는 그대로 처리한다.
  }
  return path;
}
