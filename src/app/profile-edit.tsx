import { useEffect, useState } from "react";

import { saveAvatar } from "@/api/avatar";
import { fetchMyProfile, saveNickname, type MyProfile } from "@/screens/my/api/profile";
import { ProfileEditScreen } from "@/screens/my/ProfileEditScreen";

export default function ProfileEditRoute() {
  const [profile, setProfile] = useState<MyProfile>();

  useEffect(() => {
    fetchMyProfile()
      .then(setProfile)
      .catch((error: unknown) => console.warn("프로필을 불러오지 못했습니다.", error));
  }, []);

  return (
    <ProfileEditScreen
      authProvider={profile?.authProvider}
      currentNickname={profile?.nickname}
      avatarUrl={profile?.avatarUrl}
      onSaveNickname={saveNickname}
      onSavePhoto={saveAvatar}
    />
  );
}
