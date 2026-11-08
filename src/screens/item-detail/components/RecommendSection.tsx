import { Text, View } from "react-native";

import { Card } from "@/components/card";
import type { WishItem } from "@/types/wish-item";

const COLUMN_COUNT = 3;

type RecommendSectionProps = {
  items: WishItem[];
  onItemPress?: (item: WishItem) => void;
};

function toRows(items: WishItem[]): (WishItem | null)[][] {
  const rows: (WishItem | null)[][] = [];
  for (let index = 0; index < items.length; index += COLUMN_COUNT) {
    const row: (WishItem | null)[] = items.slice(index, index + COLUMN_COUNT);
    while (row.length < COLUMN_COUNT) row.push(null);
    rows.push(row);
  }
  return rows;
}

export function RecommendSection({ items, onItemPress }: RecommendSectionProps) {
  if (items.length === 0) return null;

  return (
    <View className="gap-[14px] px-4 py-[14px]">
      <Text className="w-full text-gray-800 font-label-14">추천 아이템</Text>
      <View className="gap-5">
        {toRows(items).map((row, rowIndex) => (
          <View key={rowIndex} className="flex-row gap-3">
            {row.map((item, columnIndex) =>
              item ? (
                <Card
                  key={item.id}
                  className="flex-1"
                  name={item.name}
                  price={item.price}
                  brand={item.brand}
                  thumbnailUrl={item.thumbnailUrl}
                  onPress={onItemPress ? () => onItemPress(item) : undefined}
                />
              ) : (
                <View key={`empty-${columnIndex}`} className="flex-1" />
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
