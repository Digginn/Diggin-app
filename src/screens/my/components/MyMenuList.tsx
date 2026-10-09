import { Pressable, Text, View } from "react-native";

import { IconMyChevron } from "@/assets/images/my";

export type MyMenuRow = {
  label: string;
  value?: string;
  hasChevron?: boolean;
  hasDivider?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function MyMenuList({ rows }: { rows: MyMenuRow[] }) {
  return (
    <View className="px-2">
      {rows.map((row) => (
        <Pressable
          key={row.label}
          accessibilityRole={row.onPress ? "button" : undefined}
          disabled={!row.onPress}
          onPress={row.onPress}
          onLongPress={row.onLongPress}
          className={`h-12 flex-row items-center justify-between ${row.hasDivider !== false ? "border-b border-gray-300" : ""}`}
        >
          <Text numberOfLines={1} className="flex-1 text-gray-800 font-b3">
            {row.label}
          </Text>
          {row.value ? (
            <Text className="text-gray-800 font-meta">{row.value}</Text>
          ) : row.hasChevron !== false ? (
            <View className="size-6 items-center justify-center">
              <View className="-scale-x-100">
                <IconMyChevron width={18} height={18} />
              </View>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
