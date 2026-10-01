import { Alert, Pressable, Text, View } from "react-native";

import HelpIcon from "@/assets/images/folder/icon-sort-help.svg";
import { Chip } from "@/components/Chip";

export type FolderSortOrder = "latest" | "name" | "item-count";

const SORT_OPTIONS = [
  { value: "latest", label: "최신 순", dotClassName: "bg-gray-600" },
  { value: "name", label: "가나다 순", dotClassName: "bg-gray-500" },
  { value: "item-count", label: "많이 담은 순", dotClassName: "bg-gray-400" },
] as const;

type FolderSortFilterProps = {
  isOpen: boolean;
  value: FolderSortOrder | null;
  count: number;
  onToggle: () => void;
  onChange: (value: FolderSortOrder) => void;
};

export function FolderSortFilter({
  isOpen,
  value,
  count,
  onToggle,
  onChange,
}: FolderSortFilterProps) {
  return (
    <View pointerEvents="box-none" className={`relative self-start ${isOpen ? "flex-1" : ""}`}>
      <View className="h-12 flex-row items-center">
        <Chip
          label={SORT_OPTIONS.find((option) => option.value === value)?.label ?? "보기 순"}
          isOpen={isOpen}
          accessibilityLabel="폴더 보기 순 필터"
          onPress={onToggle}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="폴더 정렬 도움말"
          className="size-12 items-center justify-center"
          onPress={() => Alert.alert("보기 순", "최신 순은 최근 생성한 폴더부터 보여줍니다.")}
        >
          <HelpIcon />
        </Pressable>
      </View>
      {isOpen && (
        <View className="items-start gap-2">
          {SORT_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`${option.label}, ${count}개`}
              accessibilityState={{ selected: (value ?? "latest") === option.value }}
              className="flex-row items-center gap-2 rounded-full border border-gray-200 bg-gray-0 px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.1)] active:opacity-75"
              onPress={() => onChange(option.value)}
            >
              <View className={`size-2 rounded-full ${option.dotClassName}`} />
              <View className="flex-row items-center gap-1">
                <Text className="text-gray-900 font-b3">{option.label}</Text>
                <Text className="text-gray-900 font-label-14">{count >= 999 ? "999+" : count}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
