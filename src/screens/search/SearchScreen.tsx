import { useState } from "react";
import { Text, View } from "react-native";

import { IconNotification } from "@/assets/images/appbar";
import { AppBar, SearchBar } from "@/components/app-bar";
import { WishItemGrid } from "@/components/WishItemGrid";
import { WishLevel } from "@/components/WishLevel";
import { SortLabel, type SortOrder } from "@/screens/all/components/SortLabel";
import type { WishItem, WishLevelCounts } from "@/types/wish-item";

import { RecentSearches } from "./components/RecentSearches";
import { useRecentSearches } from "./useRecentSearches";

// TODO: API 연결 전까지 쓰는 임시 데이터.
const MOCK_RESULTS: WishItem[] = Array.from({ length: 8 }, (_, index) => ({
  id: String(index),
  name: "아이템명",
  price: 0,
  brand: "브랜드명",
  thumbnailUrl: null,
}));

const MOCK_LEVELS: WishLevelCounts = { high: 0, medium: 0, low: 0 };

export function SearchScreen() {
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("latest");
  const recentSearches = useRecentSearches();

  const results = submitted ? MOCK_RESULTS : [];

  const handleSubmit = (value: string) => {
    if (!value) return;
    setSubmitted(value);
    recentSearches.add(value);
  };

  return (
    <View className="flex-1 bg-gray-0">
      <SearchBar
        value={keyword}
        onChangeText={setKeyword}
        onClear={() => setSubmitted("")}
        onSubmitEditing={(event) => handleSubmit(event.nativeEvent.text)}
        right={<AppBar.IconButton icon={IconNotification} accessibilityLabel="알림" />}
      />

      {submitted ? (
        <WishItemGrid
          items={results}
          header={
            <View className="gap-2 pt-4">
              <Text className="text-gray-1000 font-label-12-semibold">
                검색된 아이템 {results.length}개
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
      ) : (
        <RecentSearches
          keywords={recentSearches.keywords}
          onSelect={(value) => {
            setKeyword(value);
            handleSubmit(value);
          }}
          onRemove={recentSearches.remove}
          onClearAll={recentSearches.clear}
        />
      )}
    </View>
  );
}
