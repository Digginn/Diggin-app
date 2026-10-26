import { View } from "react-native";

import { Card } from "@/components/card";
import type { PostItem } from "@/types/post";

type SelectCardProps = {
  item: PostItem;
  name: string;
  price: number | null;
  brand?: string | null;
  isSelected: boolean;
  onToggle: () => void;
};

export function SelectCard({ item, name, price, brand, isSelected, onToggle }: SelectCardProps) {
  return (
    <View className="flex-1">
      <Card
        name={name}
        price={price}
        brand={brand}
        thumbnailUrl={item.imageUrl}
        select={isSelected ? "selected" : "unselected"}
        onPress={onToggle}
      />
    </View>
  );
}
