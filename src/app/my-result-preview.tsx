import { useRouter, type Href } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { useToast } from "@/hooks/useToast";
import { PROFILE_MESSAGES } from "@/screens/my/constants/profileMessages";

export default function MyResultPreview() {
  const router = useRouter();
  const showToast = useToast();
  const preview = (message: string, path: Href) => {
    router.replace(path);
    showToast(message);
  };

  return (
    <View className="flex-1 bg-gray-50">
      <AppBar title="프로필 결과 미리보기" />
      <ScrollView contentContainerClassName="gap-4 px-margin py-6">
        <Text className="text-gray-700 font-b3">실제 서버 저장 없이 메시지 표시만 확인합니다.</Text>
        <Button onPress={() => preview(PROFILE_MESSAGES.nicknameSuccess, "/(tabs)/my" as Href)}>
          닉네임 변경 성공
        </Button>
        <Button onPress={() => preview(PROFILE_MESSAGES.nicknameFailure, "/profile-edit" as Href)}>
          닉네임 변경 실패
        </Button>
        <Button onPress={() => preview(PROFILE_MESSAGES.photoFailure, "/profile-edit" as Href)}>
          프로필 사진 변경 실패
        </Button>
      </ScrollView>
    </View>
  );
}
