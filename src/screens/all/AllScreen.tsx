import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { IconNotification, IconSearch } from "@/assets/images/appbar";
import { AppBar } from "@/components/app-bar";
import { WishItemGrid } from "@/components/WishItemGrid";
import { WishLevel } from "@/components/WishLevel";
import type { WishItem, WishLevelCounts } from "@/types/wish-item";

import { AllEmpty } from "./components/AllEmpty";
import { SortLabel, type SortOrder } from "./components/SortLabel";

// TODO: API 연결 전까지 쓰는 임시 데이터. 연결 시 TanStack Query 로 교체한다.
const MOCK_ITEMS: WishItem[] = Array.from({ length: 11 }, (_, index) => ({
  id: String(index),
  name: "아이템명",
  price: 0,
  brand: "브랜드명",
  thumbnailUrl: null,
}));

const MOCK_LEVELS: WishLevelCounts = { high: 0, medium: 0, low: 0 };

export function AllScreen() {
  const router = useRouter();
  const [sortOrder, setSortOrder] = useState<SortOrder>("latest");

  const items = MOCK_ITEMS;

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar
        left="logo"
        right={
          <>
            <AppBar.IconButton
              icon={IconSearch}
              accessibilityLabel="검색"
              onPress={() => router.push("/search")}
            />
            <AppBar.IconButton icon={IconNotification} accessibilityLabel="알림" />
          </>
        }
      />

      {items.length === 0 ? (
        <AllEmpty />
      ) : (
        <WishItemGrid
          items={items}
          onItemPress={(item) => router.push(`/items/${item.id}`)}
          header={
            <View className="gap-2 pt-4">
              <Text className="text-gray-1000 font-label-12-semibold">
                저장한 아이템 {items.length}개
              </Text>
              <View className="h-12 flex-row items-center justify-between">
                <View>
                  <WishLevel
                    levels={MOCK_LEVELS}
                    hint="아이템 상세 화면에서 얼마나 사고 싶은지를 3단계로 기록해두어 구매 고민을 빠르게 마칠 수 있습니다."
                  />
                </View>
                <SortLabel value={sortOrder} onChange={setSortOrder} />
              </View>
            </View>
          }
        />
      )}
    </View>
  );
}
