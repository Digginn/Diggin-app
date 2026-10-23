import { useEffect, useState } from "react";

import { saveAvatar } from "@/api/avatar";
import { MemberOnly } from "@/components/MemberOnly";
import { fetchMyProfile, saveNickname, type MyProfile } from "@/screens/my/api/profile";
import { ProfileEditScreen } from "@/screens/my/ProfileEditScreen";

function ProfileEditContent() {
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

export default function ProfileEditRoute() {
  return (
    <MemberOnly title="프로필 수정">
      <ProfileEditContent />
    </MemberOnly>
  );
}
