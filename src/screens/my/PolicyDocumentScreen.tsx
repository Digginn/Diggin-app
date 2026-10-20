import { StatusBar } from "expo-status-bar";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "@/components/app-bar";

import documents from "./constants/policyDocuments.json";

export type PolicyDocument = keyof typeof documents;

const DOCUMENT_TITLES: Record<PolicyDocument, string> = {
  terms: "이용약관",
  privacy: "개인정보 처리방침",
  community: "커뮤니티 이용정책",
};

type ContentBlock = {
  text?: string;
  variant?: string;
  spacer?: number;
  gap?: number;
  children?: ContentBlock[];
};

const TEXT_CLASSES: Record<string, string> = {
  chapter: "text-gray-1000 font-label-16-bold",
  heading: "text-gray-1000 font-label-14",
  body: "text-gray-700 font-b4",
  muted: "text-gray-600 font-b4",
};

const GAP_CLASSES: Record<number, string> = { 0: "gap-0", 4: "gap-1", 8: "gap-2", 20: "gap-5" };
const SPACER_CLASSES: Record<number, string> = { 4: "h-1", 16: "h-4", 24: "h-6" };

function DocumentContent({ block }: { block: ContentBlock }) {
  if (block.children) {
    return (
      <View className={GAP_CLASSES[block.gap ?? 0]}>
        {block.children.map((child, index) => (
          <DocumentContent key={index} block={child} />
        ))}
      </View>
    );
  }
  if (block.spacer !== undefined) return <View className={SPACER_CLASSES[block.spacer]} />;
  return (
    <Text selectable className={TEXT_CLASSES[block.variant ?? "body"]}>
      {block.text}
    </Text>
  );
}

export function PolicyDocumentScreen({ document }: { document: PolicyDocument }) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <AppBar title={DOCUMENT_TITLES[document]} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-margin pt-6"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <DocumentContent block={documents[document]} />
      </ScrollView>
    </View>
  );
}
