import { Pressable, View } from "react-native";

import CheckSvg from "@/assets/images/icon-check-active.svg";
import { Card } from "@/components/card";
import { colors } from "@/theme";
import type { PostItem } from "@/types/post";

const CHECK_SIZE = 12;

type SelectCardProps = {
  item: PostItem;
  name: string;
  price: number;
  brand?: string | null;
  isSelected: boolean;
  onToggle: () => void;
};

export function SelectCard({ item, name, price, brand, isSelected, onToggle }: SelectCardProps) {
  return (
    <View className="flex-1">
      <Card name={name} price={price} brand={brand} thumbnailUrl={item.imageUrl} />
      <Pressable
        accessibilityLabel={`${name} 선택`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        className="absolute left-[63px] top-[62px] size-12 items-center justify-center p-2.5"
        onPress={onToggle}
      >
        <View className="size-[18px] items-center justify-center rounded-[3px] border border-gray-600 bg-gray-0">
          {isSelected ? (
            <CheckSvg width={CHECK_SIZE} height={CHECK_SIZE} color={colors.gray[700]} />
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}
