import { useRouter } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
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
    />
  );
}
