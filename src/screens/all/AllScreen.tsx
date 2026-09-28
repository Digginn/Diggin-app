import { FlatList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/card/Card";
import { CardSkeleton } from "@/components/card/CardSkeleton";

// 임시 확인 화면. Card / FallbackImg / 3열 그리드를 검증한다.

type SampleItem = {
  id: string;
  name: string;
  price: number;
  thumbnailUrl?: string | null;
  brand?: string | null;
};

const ITEMS: SampleItem[] = [
  {
    id: "1",
    name: "정상 이미지",
    price: 129000,
    brand: "COS",
    thumbnailUrl: "https://picsum.photos/id/1027/214/212",
  },
  { id: "2", name: "이미지 없음 (null)", price: 8900, brand: "Uniqlo", thumbnailUrl: null },
  {
    id: "3",
    name: "로드 실패 (깨진 URL)",
    price: 249000,
    brand: "Acne Studios",
    thumbnailUrl: "https://example.invalid/none.png",
  },
  { id: "4", name: "브랜드명 null", price: 89000, brand: null },
  {
    id: "5",
    name: "아주 긴 상품명이 들어가면 한 줄에서 잘려야 합니다",
    price: 1290000,
    brand: "매우 긴 브랜드명도 한 줄에서 잘립니다",
  },
  { id: "6", name: "레더 스니커즈", price: 320000, brand: "Common Projects" },
];

const COLUMN_COUNT = 3;

export function AllScreen() {
  const fillerCount = (COLUMN_COUNT - (ITEMS.length % COLUMN_COUNT)) % COLUMN_COUNT;
  const rows: (SampleItem | null)[] = [
    ...ITEMS,
    ...Array.from({ length: fillerCount }, () => null),
  ];

  return (
    // AppBar(#7)가 머지되기 전까지 상단 여백을 SafeAreaView가 대신 잡는다- AppBar는 자체적으로 insets.top을 처리하므로 머지 후에는 edges에서 top을 뺀다.
    <SafeAreaView className="flex-1 bg-gray-0" edges={["top"]}>
      <FlatList
        className="flex-1"
        columnWrapperClassName="gap-3"
        contentContainerClassName="gap-5 px-4 pb-10"
        data={rows}
        keyExtractor={(item, index) => item?.id ?? `filler-${index}`}
        ListFooterComponent={
          <View className="flex-row gap-3 pt-8">
            <CardSkeleton className="flex-1" />
            <CardSkeleton className="flex-1" />
            <CardSkeleton className="flex-1" />
          </View>
        }
        numColumns={COLUMN_COUNT}
        renderItem={({ item }) =>
          item ? (
            <Card
              brand={item.brand}
              className="flex-1"
              name={item.name}
              onPress={() => {}}
              price={item.price}
              thumbnailUrl={item.thumbnailUrl}
            />
          ) : (
            <View className="flex-1" />
          )
        }
      />
    </SafeAreaView>
  );
}
