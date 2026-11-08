import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { APP_GROUP } from "@/constants/appGroup";

const folder = Platform.OS === "ios" ? Paths.appleSharedContainers[APP_GROUP] : undefined;
const marker = folder ? new File(folder, "share-saved-at") : null;

/** 공유 확장에서 저장했다고 남긴다. 앱은 다음에 화면으로 돌아올 때 목록을 다시 불러온다. */
export function markSharedSave() {
  marker?.write(String(Date.now()));
}

export async function readSharedSaveTime() {
  if (!marker?.exists) return 0;
  return Number(await marker.text()) || 0;
}
