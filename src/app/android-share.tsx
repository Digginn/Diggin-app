import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { clearSharedPayloads, getSharedPayloads } from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Platform } from "react-native";

import { keepShareLink } from "@/lib/pendingShareLink";
import { ShareSaveScreen } from "@/screens/save/ShareSaveScreen";

export default function AndroidShareRoute() {
  const router = useRouter();
  const { receivedAt } = useLocalSearchParams<{ receivedAt?: string }>();
  const [incoming, setIncoming] = useState<{ receivedAt?: string; shared: string } | null>(null);
  const consumed = useRef<typeof incoming>(null);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    // Strict Mode의 effect 재실행이나 일반 렌더에서는 같은 공유를 다시 소비하지 않는다.
    if (consumed.current && consumed.current.receivedAt === receivedAt) return;
    const shared = getSharedPayloads()
      .filter((payload) => payload.shareType === "text" || payload.shareType === "url")
      .map((payload) => payload.value ?? "")
      .join(" ")
      .trim();
    clearSharedPayloads();
    const next = { receivedAt, shared };
    consumed.current = next;
    setIncoming(next);
  }, [receivedAt]);
  const finish = useCallback(() => {
    router.replace("/(tabs)/all");
    BackHandler.exitApp();
  }, [router]);
  const login = useCallback(
    (url: string) => {
      keepShareLink(url);
      router.replace("/login");
    },
    [router],
  );
  const openItem = useCallback(
    (id: string) => {
      router.replace({ pathname: "/items/[id]", params: { id } });
    },
    [router],
  );

  useEffect(() => {
    if (Platform.OS !== "android" || !incoming?.shared || incoming.receivedAt !== receivedAt)
      return;
    // 편집 모달이 떠 있으면 모달의 입력 폐기 확인이 뒤로가기를 처리한다.
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      finish();
      return true;
    });
    return () => listener.remove();
  }, [finish, incoming, receivedAt]);

  if (Platform.OS !== "android") return <Redirect href="/(tabs)/all" />;
  if (!incoming || incoming.receivedAt !== receivedAt) return null;
  if (!incoming.shared) return <Redirect href="/(tabs)/all" />;
  return (
    <ShareSaveScreen
      key={receivedAt ?? ""}
      shared={incoming.shared}
      isInline={false}
      onClose={finish}
      onLogin={login}
      onOpenItem={openItem}
    />
  );
}
