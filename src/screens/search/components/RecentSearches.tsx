import { Pressable, Text, View } from "react-native";

import { Tag } from "@/components/Tag";

import { MAX_RECENT_SEARCHES } from "../constants";

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

      <View className="flex-row flex-wrap gap-x-2 px-margin">
        {keywords.slice(0, MAX_RECENT_SEARCHES).map((keyword) => (
          <View key={keyword} className="h-9 max-w-[200px] justify-center">
            <Tag
              label={keyword}
              className="max-w-[200px]"
              onPress={() => onSelect(keyword)}
              onClose={() => onRemove(keyword)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
