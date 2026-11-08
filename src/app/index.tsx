import { Redirect, type Href } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import { OnboardingScreen } from "@/screens/onboarding/OnboardingScreen";

export default function IndexRoute() {
  const { session } = useAuth();
  // AUTH-009 로그인 상태가 복원되면 시작 Flow를 건너뛰고 Main으로 간다.
  if (session) return <Redirect href={"/(tabs)/all" as Href} />;
  return <OnboardingScreen />;
}
