import { useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconMyChevron } from "@/assets/images/my";
import { AppBar } from "@/components/app-bar";

export type TermsDocument = "terms" | "privacy" | "community" | "licenses";

const DOCUMENTS: { key: TermsDocument; label: string }[] = [
  { key: "terms", label: "이용약관" },
  { key: "privacy", label: "개인정보 처리방침" },
  { key: "community", label: "커뮤니티 이용정책" },
  { key: "licenses", label: "오픈소스 라이센스" },
];

type TermsScreenProps = {
  onPressDocument?: (document: TermsDocument) => void;
};

export function TermsScreen({ onPressDocument }: TermsScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <AppBar title="약관 및 정책" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-margin pt-6"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {DOCUMENTS.map(({ key, label }) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() =>
              onPressDocument ? onPressDocument(key) : router.push(`/policies/${key}` as Href)
            }
            className="h-12 flex-row items-center justify-between border-b border-gray-300"
          >
            <Text className="flex-1 text-gray-800 font-b3">{label}</Text>
            <View className="h-12 w-12 items-center justify-center pl-3">
              <View className="-scale-x-100">
                <IconMyChevron />
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
