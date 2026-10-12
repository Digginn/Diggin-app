import { useBrowsingMode } from "@/contexts/BrowsingModeContext";
import { MyScreen } from "@/screens/my/MyScreen";

export default function MyRoute() {
  const { isGuest } = useBrowsingMode();
  return <MyScreen isGuest={isGuest} />;
}
