import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { saveAvatar } from "@/api/avatar";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { MemberOnly } from "@/components/MemberOnly";
import { TOAST_MESSAGES } from "@/constants/messages";
import { useToast } from "@/hooks/useToast";
import { fetchMyProfile, saveNickname, type MyProfile } from "@/screens/my/api/profile";
import { ProfileEditScreen } from "@/screens/my/ProfileEditScreen";

function ProfileEditContent() {
  const [profile, setProfile] = useState<MyProfile>();
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const showToast = useToast();

  useEffect(() => {
    let isActive = true;
    fetchMyProfile()
      .then((data) => {
        if (isActive) setProfile(data);
      })
      .catch(() => {
        if (!isActive) return;
        setHasError(true);
        showToast(TOAST_MESSAGES.SYS_002);
      });
    return () => {
      isActive = false;
    };
  }, [attempt, showToast]);

  if (!profile)
    return (
      <View className="flex-1 bg-gray-50">
        <AppBar title="프로필 수정" />
        <View className="flex-1 items-center justify-center">
          {hasError ? (
            <Button
              onPress={() => {
                setHasError(false);
                setAttempt((value) => value + 1);
              }}
            >
              다시 시도
            </Button>
          ) : (
            <ActivityIndicator accessibilityLabel="프로필 불러오는 중" />
          )}
        </View>
      </View>
    );

  return (
    <ProfileEditScreen
      authProvider={profile.authProvider}
      currentNickname={profile.nickname}
      avatarUrl={profile.avatarUrl}
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
