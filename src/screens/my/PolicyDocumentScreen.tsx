import { StatusBar } from "expo-status-bar";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "@/components/app-bar";
import { PolicyDocumentContent, type PolicyDocument } from "@/components/PolicyDocumentContent";

const DOCUMENT_TITLES: Record<PolicyDocument, string> = {
  terms: "이용약관",
  privacy: "개인정보 처리방침",
  community: "커뮤니티 이용정책",
};

export function PolicyDocumentScreen({ document }: { document: PolicyDocument }) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <AppBar title={DOCUMENT_TITLES[document]} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-margin pt-6"
        // 이용약관·개인정보 시안의 하단 여백은 문서 마지막 Spacer에 포함돼 있다.
        contentContainerStyle={{
          paddingBottom: insets.bottom + (document === "community" ? 24 : 0),
        }}
      >
        <PolicyDocumentContent document={document} />
      </ScrollView>
    </View>
  );
}
