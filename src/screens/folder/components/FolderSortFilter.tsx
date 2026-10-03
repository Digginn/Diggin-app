import { Pressable, Text, View } from "react-native";

import { Chip } from "@/components/Chip";

export type FolderSortOrder = "latest" | "item-count";

const SORT_OPTIONS = [
  { value: "latest", label: "최근 담은 순" },
  { value: "item-count", label: "많이 담은 순" },
] as const;

type FolderSortFilterProps = {
  isOpen: boolean;
  value: FolderSortOrder | null;
  onToggle: () => void;
  onChange: (value: FolderSortOrder) => void;
};

export function FolderSortFilter({ isOpen, value, onToggle, onChange }: FolderSortFilterProps) {
  return (
    <View pointerEvents="box-none" className={`relative self-start ${isOpen ? "flex-1" : ""}`}>
      <View className="h-12 flex-row items-center">
        <Chip
          label={
            SORT_OPTIONS.find((option) => option.value === value)?.label ?? SORT_OPTIONS[0].label
          }
          isOpen={isOpen}
          accessibilityLabel="폴더 보기 순 필터"
          onPress={onToggle}
        />
      </View>
      {isOpen && (
        <View className="items-start gap-2">
          {SORT_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: (value ?? "latest") === option.value }}
              className="flex-row items-center gap-2 rounded-full border border-gray-200 bg-gray-0 px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.1)] active:opacity-75"
              onPress={() => onChange(option.value)}
            >
              <Text className="text-gray-900 font-b3">{option.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
