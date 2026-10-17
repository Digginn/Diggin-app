import { Text, View } from "react-native";

import LinkIcon from "@/assets/images/icon-link.svg";

type ItemInfoProps = {
  name: string;
  /** null이면 가격 정보 없음(ALL-005). */
  price: number | null;
  sourceUrl?: string | null;
};

export function ItemInfo({ name, price, sourceUrl }: ItemInfoProps) {
  return (
    <View className="gap-1">
      <View className="gap-[5px]">
        {sourceUrl ? (
          <View className="h-[14px] w-[170px] flex-row items-center gap-[5px]">
            <LinkIcon width={14} height={14} />
            <Text numberOfLines={1} className="flex-1 text-gray-400 font-label-12-regular">
              {sourceUrl}
            </Text>
          </View>
        ) : null}
        <Text numberOfLines={2} className="text-gray-1000 font-label-16-medium">
          {name}
        </Text>
      </View>
      <Text className="text-gray-1000 font-price-detail">
        {price === null ? "가격 정보 없음" : `${price.toLocaleString("ko-KR")}원`}
      </Text>
    </View>
  );
}
