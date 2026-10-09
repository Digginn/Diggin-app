import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";

import { AppBar } from "@/components/app-bar";
import { useToast } from "@/hooks/useToast";

import { MyMenuList } from "./components/MyMenuList";

export function MyActivityScreen() {
  const router = useRouter();
  const showToast = useToast();

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar title="내 활동" />
      <ScrollView contentContainerClassName="px-margin pt-6" showsVerticalScrollIndicator={false}>
        <MyMenuList
          rows={[
            { label: "내가 쓴 글", onPress: () => router.push("/my-posts") },
            // 목록 시안·API 연결 전까지 미구현임을 안내한다.
            {
              label: "내가 좋아요한 글",
              onPress: () => showToast("좋아요한 글 목록은 준비 중입니다."),
            },
          ]}
        />
      </ScrollView>
    </View>
  );
}
