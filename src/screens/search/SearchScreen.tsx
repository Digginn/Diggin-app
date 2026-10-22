import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { SearchBar } from "@/components/app-bar";
import { NotificationButton } from "@/components/app-bar/NotificationButton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { WishItemGrid } from "@/components/WishItemGrid";
import { WishLevel } from "@/components/WishLevel";
import { STATE_MESSAGES } from "@/constants/messages";
import { useProductCounts } from "@/hooks/useProductCounts";
import { useProductList } from "@/hooks/useProductList";
import { SortLabel, type SortOrder } from "@/screens/all/components/SortLabel";
import type { WishLevelCounts, WishLevelKey } from "@/types/wish-item";

import { RecentSearches } from "./components/RecentSearches";
import { MAX_SEARCH_LENGTH } from "./constants";
import { useRecentSearches } from "./useRecentSearches";

const EMPTY_LEVELS: WishLevelCounts = { high: 0, medium: 0, low: 0 };

// ALL-004 입력을 멈추면 검색한다. 글자마다 요청하지 않도록 잠깐 기다린다.
const SEARCH_DELAY_MS = 300;

export function SearchScreen() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  // 검색 버튼으로 실행한 순서. 뒤로 가기가 한 단계씩 되감는다.
  const [history, setHistory] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>("latest");
  const [wishLevel, setWishLevel] = useState<WishLevelKey | null>(null);
  const recentSearches = useRecentSearches();

  useEffect(() => {
    const timer = setTimeout(() => setQuery(keyword.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [keyword]);

  const isSearching = query.length > 0;
  const list = useProductList(sortOrder, wishLevel, query, isSearching);
  const counts = useProductCounts(query, isSearching);
  const items = list.data?.pages.flat() ?? [];
  const totalCount = counts.data?.total ?? 0;
  const shownCount = wishLevel ? (counts.data?.levels[wishLevel] ?? 0) : totalCount;

  const handleSubmit = (text: string) => {
    const value = text.slice(0, MAX_SEARCH_LENGTH);
    if (!value.trim()) return;
    setKeyword(value);
    setQuery(value.trim());
    if (value !== history.at(-1)) setHistory((prev) => [...prev, value]);
    recentSearches.add(value);
  };

  // 실행한 검색이 남아 있으면 직전 검색으로, 입력만 했으면 대기 화면으로 돌아가고, 둘 다 없을 때 화면을 벗어난다.
  const handleBack = () => {
    if (history.length > 0) {
      const previous = history.slice(0, -1);
      setHistory(previous);
      setKeyword(previous.at(-1) ?? "");
      return;
    }
    if (keyword) {
      setKeyword("");
      return;
    }
    router.back();
  };

  return (
    <View className="flex-1 bg-gray-0">
      <SearchBar
        autoFocus
        maxLength={MAX_SEARCH_LENGTH}
        value={keyword}
        onChangeText={setKeyword}
        onBack={handleBack}
        onClear={() => {
          setKeyword("");
          setHistory([]);
        }}
        onSubmitEditing={(event) => handleSubmit(event.nativeEvent.text)}
        right={<NotificationButton onPress={() => router.push("/notifications")} />}
      />

      {!isSearching ? (
        <RecentSearches
          keywords={recentSearches.keywords}
          onSelect={handleSubmit}
          onRemove={recentSearches.remove}
          onClearAll={recentSearches.clear}
        />
      ) : list.isError || counts.isError ? (
        <ErrorState
          message={STATE_MESSAGES.loadFailed}
          onRetry={() => {
            void list.refetch();
            void counts.refetch();
          }}
        />
      ) : counts.isPending ? (
        <View className="flex-1" />
      ) : totalCount === 0 ? (
        <EmptyState message={STATE_MESSAGES.searchEmpty} />
      ) : (
        <WishItemGrid
          items={items}
          isLoading={list.isPending}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          onItemPress={(item) => router.push(`/items/${item.id}`)}
          header={
            <View className="gap-2 pt-4">
              <Text className="text-gray-1000 font-label-12-semibold">
                검색된 아이템 {shownCount}개
              </Text>
              <View className="h-12 flex-row items-center justify-between">
                <View>
                  <WishLevel
                    hasScrim
                    levels={counts.data?.levels ?? EMPTY_LEVELS}
                    hint="아이템 상세 화면에서 얼마나 사고 싶은지를 3단계로 기록해두어 구매 고민을 빠르게 마칠 수 있습니다."
                    selected={wishLevel}
                    onSelect={(level) => setWishLevel((prev) => (prev === level ? null : level))}
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
