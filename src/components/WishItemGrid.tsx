import type { ReactElement } from "react";
import { FlatList, View } from "react-native";

import { Card } from "@/components/card";
import type { WishItem } from "@/types/wish-item";

const COLUMN_COUNT = 3;
const COLUMN_GAP = 12;
const ROW_GAP = 20;
const SCREEN_PADDING = 15.75;

type WishItemGridProps = {
  items: WishItem[];
  header?: ReactElement;
  onItemPress?: (item: WishItem) => void;
};

function padToFullRows(items: WishItem[]): (WishItem | null)[] {
  const remainder = items.length % COLUMN_COUNT;
  if (remainder === 0) return items;
  return [...items, ...Array.from({ length: COLUMN_COUNT - remainder }, () => null)];
}

export function WishItemGrid({ items, header, onItemPress }: WishItemGridProps) {
  return (
    <FlatList
      data={padToFullRows(items)}
      numColumns={COLUMN_COUNT}
      keyExtractor={(item, index) => item?.id ?? `empty-${index}`}
      columnWrapperStyle={{ gap: COLUMN_GAP, marginBottom: ROW_GAP }}
      contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING }}
      ListHeaderComponent={header}
      renderItem={({ item }) =>
        item ? (
          <Card
            className="flex-1"
            name={item.name}
            price={item.price}
            brand={item.brand}
            thumbnailUrl={item.thumbnailUrl}
            onPress={onItemPress ? () => onItemPress(item) : undefined}
          />
        ) : (
          <View className="flex-1" />
        )
      }
    />
  );
}
