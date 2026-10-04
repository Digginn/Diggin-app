import { Pressable, Text, View } from "react-native";

import PlusSvg from "@/assets/images/icon-plus.svg";
import { ProductImg } from "@/components/ProductImg";
import { colors } from "@/theme";
import type { PostItem } from "@/types/post";

const PLUS_SIZE = 18;
const COLUMN_COUNT = 2;
export const MAX_ATTACH_COUNT = 4;

type Cell = PostItem | "add" | null;

type ProductAttachGridProps = {
  items: PostItem[];
  onPressAdd: () => void;
  onRemove?: (item: PostItem) => void;
};

function toRows(items: PostItem[]): Cell[][] {
  const cells: Cell[] = [...items];
  if (items.length < MAX_ATTACH_COUNT) cells.push("add");

  const rows: Cell[][] = [];
  for (let index = 0; index < cells.length; index += COLUMN_COUNT) {
    const row: Cell[] = cells.slice(index, index + COLUMN_COUNT);
    while (row.length < COLUMN_COUNT) row.push(null);
    rows.push(row);
  }
  return rows;
}

export function ProductAttachGrid({ items, onPressAdd, onRemove }: ProductAttachGridProps) {
  return (
    <View className="w-full gap-[7px]">
      {toRows(items).map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-[7px]">
          {row.map((cell, columnIndex) => {
            if (cell === null) return <View key={`empty-${columnIndex}`} className="flex-1" />;
            if (cell === "add") {
              return (
                <Pressable
                  key="add"
                  accessibilityLabel="아이템 추가"
                  accessibilityRole="button"
                  className="aspect-square flex-1 items-center justify-center gap-2 overflow-hidden rounded-lg border-field border-dashed border-gray-300 bg-gray-50 active:opacity-75"
                  onPress={onPressAdd}
                >
                  <PlusSvg width={PLUS_SIZE} height={PLUS_SIZE} color={colors.gray[900]} />
                  <Text className="text-gray-500 font-b4">아이템 추가</Text>
                </Pressable>
              );
            }
            return (
              <ProductImg
                key={cell.id}
                className="flex-1"
                url={cell.imageUrl}
                onRemove={onRemove ? () => onRemove(cell) : undefined}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
