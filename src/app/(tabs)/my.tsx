import { useRouter } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import { withdrawAccount } from "@/screens/my/api/withdrawal";
import { MyScreen } from "@/screens/my/MyScreen";

export default function MyRoute() {
  const router = useRouter();
  const { session, signOut } = useAuth();

  return (
    <MyScreen
      isGuest={!session}
      onLogout={async () => {
        await signOut();
        // MY-005 로그아웃하면 앱 시작 화면으로 돌아간다.
        router.replace("/");
      }}
      onWithdraw={async (survey) => {
        if ((await withdrawAccount(survey)) === "cancelled") return "cancelled";
        // 계정이 지워져 세션 갱신이 실패하면 로그인 만료 안내가 완료 창을 덮는다. 바로 이 기기에서 로그아웃한다.
        await signOut().catch(() => undefined);
      }}
      // MY-007 확인을 누르면 앱 시작 화면(온보딩)으로 돌아간다.
      onWithdrawComplete={() => router.replace("/")}
    />
  );
}
