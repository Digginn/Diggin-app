import type { ReactElement } from "react";
import { FlatList, View } from "react-native";

import { Card, CardSkeleton } from "@/components/card";
import type { WishItem } from "@/types/wish-item";

const COLUMN_COUNT = 3;
const COLUMN_GAP = 12;
const ROW_GAP = 20;
const SCREEN_PADDING = 15.75;

const SKELETON_COUNT = 12;

type WishItemGridProps = {
  items: WishItem[];
  header?: ReactElement;
  isLoading?: boolean;
  onItemPress?: (item: WishItem) => void;
  /** 선택 모드일 때만 넘긴다. 넘기면 모든 카드에 체크박스가 생긴다. */
  selectedIds?: ReadonlySet<string>;
};

function padToFullRows(items: WishItem[]): (WishItem | null)[] {
  const remainder = items.length % COLUMN_COUNT;
  if (remainder === 0) return items;
  return [...items, ...Array.from({ length: COLUMN_COUNT - remainder }, () => null)];
}

export function WishItemGrid({
  items,
  header,
  isLoading = false,
  onItemPress,
  selectedIds,
}: WishItemGridProps) {
  return (
    <FlatList
      data={isLoading ? Array.from({ length: SKELETON_COUNT }, () => null) : padToFullRows(items)}
      numColumns={COLUMN_COUNT}
      keyExtractor={(item, index) => item?.id ?? `empty-${index}`}
      columnWrapperStyle={{ gap: COLUMN_GAP, marginBottom: ROW_GAP }}
      contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING }}
      ListHeaderComponent={header}
      renderItem={({ item }) =>
        isLoading ? (
          <CardSkeleton className="flex-1" />
        ) : item ? (
          <Card
            className="flex-1"
            name={item.name}
            price={item.price}
            brand={item.brand}
            thumbnailUrl={item.thumbnailUrl}
            select={selectedIds ? (selectedIds.has(item.id) ? "selected" : "unselected") : "none"}
            onPress={onItemPress ? () => onItemPress(item) : undefined}
          />
        ) : (
          <View className="flex-1" />
        )
      }
    />
  );
}
