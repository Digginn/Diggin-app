import { Text, View } from "react-native";

import documents from "@/constants/policyDocuments.json";

export type PolicyDocument = keyof typeof documents;

type ContentBlock = {
  text?: string;
  variant?: string;
  spacer?: number;
  gap?: number;
  paddingBottom?: number;
  isListItem?: boolean;
  segments?: { text: string; isStrong?: boolean }[];
  children?: ContentBlock[];
};

const TEXT_CLASSES: Record<string, string> = {
  chapter: "text-gray-1000 font-label-16-bold",
  heading: "text-gray-1000 font-label-14",
  body: "text-gray-700 font-b4",
  muted: "text-gray-600 font-b4",
};

const GAP_CLASSES: Record<number, string> = {
  0: "gap-0",
  4: "gap-1",
  8: "gap-2",
  20: "gap-5",
  32: "gap-8",
};
const SPACER_CLASSES: Record<number, string> = { 4: "h-1", 16: "h-4", 24: "h-6", 100: "h-[100px]" };

function DocumentContent({ block }: { block: ContentBlock }) {
  if (block.children) {
    return (
      <View className={`${GAP_CLASSES[block.gap ?? 0]}${block.paddingBottom === 8 ? "pb-2" : ""}`}>
        {block.children.map((child, index) => (
          <DocumentContent key={index} block={child} />
        ))}
      </View>
    );
  }
  if (block.spacer !== undefined) return <View className={SPACER_CLASSES[block.spacer]} />;
  const textClassName = TEXT_CLASSES[block.variant ?? "body"];
  const content = block.segments
    ? block.segments.map((segment, index) => (
        <Text
          key={index}
          selectable
          className={segment.isStrong ? "font-pretendard-semibold" : "font-pretendard"}
        >
          {segment.text}
        </Text>
      ))
    : block.text;
  if (block.isListItem) {
    return (
      <View className="flex-row">
        <Text selectable accessible={false} className={`w-[19.5px] text-center ${textClassName}`}>
          {"\u2022"}
        </Text>
        <Text selectable className={`flex-1 ${textClassName}`}>
          {content}
        </Text>
      </View>
    );
  }
  return (
    <Text selectable className={textClassName}>
      {content}
    </Text>
  );
}

export function PolicyDocumentContent({ document }: { document: PolicyDocument }) {
  return <DocumentContent block={documents[document]} />;
}
