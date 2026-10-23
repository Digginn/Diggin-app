import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { clearSharedPayloads, getSharedPayloads } from "expo-sharing";
import { useCallback, useEffect } from "react";
import { BackHandler, Platform } from "react-native";

import { keepShareLink } from "@/lib/pendingShareLink";
import { ShareSaveScreen } from "@/screens/save/ShareSaveScreen";

export default function AndroidShareRoute() {
  const router = useRouter();
  const { receivedAt } = useLocalSearchParams<{ receivedAt?: string }>();
  // 같은 화면이 떠 있는 중 새 공유를 받아도 새 네이티브 payload로 시작한다.
  const shared =
    Platform.OS === "android"
      ? getSharedPayloads()
          .filter((payload) => payload.shareType === "text" || payload.shareType === "url")
          .map((payload) => payload.value ?? "")
          .join(" ")
      : "";
  const finish = useCallback(() => {
    clearSharedPayloads();
    router.replace("/(tabs)/all");
    BackHandler.exitApp();
  }, [router]);
  const login = useCallback(
    (url: string) => {
      keepShareLink(url);
      clearSharedPayloads();
      router.replace("/login");
    },
    [router],
  );
  const openItem = useCallback(
    (id: string) => {
      clearSharedPayloads();
      router.replace({ pathname: "/items/[id]", params: { id } });
    },
    [router],
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;
    // 편집 모달이 떠 있으면 모달의 입력 폐기 확인이 뒤로가기를 처리한다.
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      finish();
      return true;
    });
    return () => listener.remove();
  }, [finish]);

  if (Platform.OS !== "android") return <Redirect href="/(tabs)/all" />;
  return (
    <ShareSaveScreen
      key={`${receivedAt ?? ""}:${shared}`}
      shared={shared}
      isInline={false}
      onClose={finish}
      onLogin={login}
      onOpenItem={openItem}
    />
  );
}
