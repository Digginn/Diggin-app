import { type ImageSource } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { FlatList, Keyboard, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import SearchIcon from "@/assets/images/folder/icon-detail-search.svg";
import SortIcon from "@/assets/images/folder/icon-sort.svg";
import { AppBar, SearchBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { Card } from "@/components/card";
import { WishLevel } from "@/components/WishLevel";

export type FolderDetailItem = {
  id: string;
  name: string;
  price: number | string | null;
  brand?: string | null;
  thumbnailUrl?: string | null;
  thumbnailSource?: ImageSource | number;
};

type FolderDetailScreenProps = {
  folderName: string;
  items?: FolderDetailItem[];
  savedItemCount?: number;
  levels?: { high: number; medium: number; low: number };
  isError?: boolean;
  onRetry?: () => void;
  onBack?: () => void;
  onSearch?: () => void;
  onOpenItem?: (item: FolderDetailItem) => void;
};

function DetailSearchIcon() {
  return (
    <View className="size-7 items-center justify-center">
      <SearchIcon />
    </View>
  );
}

export function FolderDetailScreen({
  folderName,
  items = [],
  savedItemCount = items.length,
  levels = { high: 0, medium: 0, low: 0 },
  isError = false,
  onRetry,
  onBack,
  onSearch,
  onOpenItem,
}: FolderDetailScreenProps) {
  const [isOldestFirst, setIsOldestFirst] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const hasSearchResults = submittedQuery.length > 0;
  const visibleItems = hasSearchResults
    ? items.filter((item) =>
        `${item.name} ${item.brand ?? ""}`
          .toLocaleLowerCase()
          .includes(submittedQuery.toLocaleLowerCase()),
      )
    : items;
  const sortedItems = isOldestFirst ? [...visibleItems].reverse() : visibleItems;
  const fillerCount = (3 - (sortedItems.length % 3)) % 3;
  const rows: (FolderDetailItem | null)[] = [
    ...sortedItems,
    ...Array.from({ length: fillerCount }, () => null),
  ];

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      {isSearching ? (
        <SearchBar
          value={searchQuery}
          onChangeText={(value) => {
            setSearchQuery(value);
            setSubmittedQuery("");
          }}
          onClear={() => {
            setSearchQuery("");
            setSubmittedQuery("");
          }}
          onSubmitEditing={() => {
            const query = searchQuery.trim();
            if (!query) return;
            setSearchQuery(query);
            setSubmittedQuery(query);
            Keyboard.dismiss();
          }}
          placeholder="찾고 싶은 아이템을 입력하세요"
          accessibilityLabel="폴더 내 아이템 검색어"
          onBack={() => {
            Keyboard.dismiss();
            setSearchQuery("");
            setSubmittedQuery("");
            if (!hasSearchResults) setIsSearching(false);
          }}
        />
      ) : (
        <AppBar
          title={folderName}
          isTitleLeftAligned
          onBack={onBack}
          right={
            <AppBar.IconButton
              icon={DetailSearchIcon}
              accessibilityLabel="폴더 내 아이템 검색"
              onPress={() => {
                setIsSearching(true);
                onSearch?.();
              }}
            />
          }
        />
      )}
      {isError ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-0 items-center justify-center px-margin"
        >
          <View className="items-center gap-margin">
            <Text
              className="text-center text-gray-500 font-b1"
              style={{ includeFontPadding: false }}
            >
              {"아이템을 불러오지 못했습니다.\n잠시 후 다시 시도해주세요."}
            </Text>
            <View className="w-[156px]">
              <Button onPress={() => onRetry?.()} isDisabled={!onRetry}>
                다시 시도
              </Button>
            </View>
          </View>
        </View>
      ) : (
        <>
          <View className="gap-2 px-4 pt-4">
            <Text className="text-gray-1000 font-label-12-semibold">
              {hasSearchResults ? "검색된 아이템" : "저장한 아이템"}{" "}
              {(hasSearchResults ? visibleItems.length : savedItemCount).toLocaleString("ko-KR")}개
            </Text>
            <View className="h-12 flex-row items-center justify-between">
              <View className="h-12 justify-center">
                <WishLevel levels={levels} label="위시레벨" />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${isOldestFirst ? "오래된 순" : "최신 순"}, 정렬 변경`}
                className="h-12 flex-row items-center gap-1 active:opacity-75"
                onPress={() => setIsOldestFirst(!isOldestFirst)}
              >
                <Text className="text-gray-600 font-label-12-semibold">
                  {isOldestFirst ? "오래된 순" : "최신 순"}
                </Text>
                <SortIcon />
              </Pressable>
            </View>
          </View>
          <FlatList
            className="flex-1"
            numColumns={3}
            data={rows}
            keyExtractor={(item, index) => item?.id ?? `filler-${index}`}
            columnWrapperClassName="gap-3"
            contentContainerClassName="gap-5 px-4 pb-6"
            renderItem={({ item }) =>
              item ? (
                <Card
                  {...item}
                  className="h-40 flex-1"
                  onPress={onOpenItem ? () => onOpenItem(item) : undefined}
                />
              ) : (
                <View className="flex-1" />
              )
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}
