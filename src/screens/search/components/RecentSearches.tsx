import { Pressable, ScrollView, Text, View } from "react-native";

import { Tag } from "@/components/Tag";

type RecentSearchesProps = {
  keywords: string[];
  onSelect: (keyword: string) => void;
  onRemove: (keyword: string) => void;
  onClearAll: () => void;
};

export function RecentSearches({ keywords, onSelect, onRemove, onClearAll }: RecentSearchesProps) {
  if (keywords.length === 0) return null;

  return (
    <View className="gap-0.5 pt-2">
      <View className="flex-row items-center justify-between px-margin">
        <Text className="text-gray-1000 font-label-14">최근 검색어</Text>
        <Pressable accessibilityRole="button" onPress={onClearAll} hitSlop={12}>
          <Text className="text-gray-500 underline font-label-12-regular">전체 삭제</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingLeft: 24, paddingRight: 18 }}
      >
        {keywords.map((keyword) => (
          <View key={keyword} className="h-12 justify-center">
            <Tag
              label={keyword}
              onPress={() => onSelect(keyword)}
              onClose={() => onRemove(keyword)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
