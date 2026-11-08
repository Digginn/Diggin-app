import { useLocalSearchParams } from "expo-router";

import { ProfileEditScreen } from "@/screens/my/ProfileEditScreen";

export default function ProfileEditPreview() {
  const { provider } = useLocalSearchParams<{ provider?: string }>();
  return (
    <ProfileEditScreen
      authProvider={provider === "google" || provider === "apple" ? provider : "kakao"}
    />
  );
}
