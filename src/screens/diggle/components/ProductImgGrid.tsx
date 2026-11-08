import { View } from "react-native";

import { ProductImg } from "@/components/ProductImg";
import type { PostItem } from "@/types/post";

const COLUMN_COUNT = 2;

type ProductImgGridProps = {
  items: PostItem[];
  onPressInfo?: (item: PostItem) => void;
  onRemove?: (item: PostItem) => void;
};

function toRows(items: PostItem[]): (PostItem | null)[][] {
  const rows: (PostItem | null)[][] = [];
  for (let index = 0; index < items.length; index += COLUMN_COUNT) {
    const row: (PostItem | null)[] = items.slice(index, index + COLUMN_COUNT);
    while (row.length < COLUMN_COUNT) row.push(null);
    rows.push(row);
  }
  return rows;
}

export function ProductImgGrid({ items, onPressInfo, onRemove }: ProductImgGridProps) {
  return (
    <View className="w-full gap-[7px]">
      {toRows(items).map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-[7px]">
          {row.map((item, columnIndex) =>
            item ? (
              <ProductImg
                key={item.id}
                className="flex-1"
                url={item.imageUrl}
                onPressInfo={onPressInfo ? () => onPressInfo(item) : undefined}
                onRemove={onRemove ? () => onRemove(item) : undefined}
              />
            ) : (
              <View key={`empty-${columnIndex}`} className="flex-1" />
            ),
          )}
        </View>
      ))}
    </View>
  );
}
