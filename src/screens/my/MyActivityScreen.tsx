import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";

import { AppBar } from "@/components/app-bar";
import { LoginRequiredModal } from "@/components/modal";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";

import { MyMenuList } from "./components/MyMenuList";

export function MyActivityScreen() {
  const router = useRouter();
  const showToast = useToast();
  const { session, isRestoring } = useAuth();
  function open(path: "/my-posts" | "/my-liked-posts") {
    try {
      router.push(path);
    } catch {
      showToast("요청을 처리하지 못했습니다. 다시 시도해 주세요.", "error");
    }
  }

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar title="내 활동" />
      {!isRestoring && !session ? (
        <LoginRequiredModal
          visible
          onClose={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/my"))}
          onLogin={() => router.push("/login")}
        />
      ) : (
        !isRestoring && (
          <ScrollView
            contentContainerClassName="px-margin pt-6"
            showsVerticalScrollIndicator={false}
          >
            <MyMenuList
              rows={[
                { label: "내가 쓴 글", onPress: () => open("/my-posts") },
                {
                  label: "내가 좋아요한 글",
                  onPress: () => open("/my-liked-posts"),
                },
              ]}
            />
          </ScrollView>
        )
      )}
    </View>
  );
}
