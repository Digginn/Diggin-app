import { type ImageSource } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { FlatList, Keyboard, Pressable, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { IconKebab } from "@/assets/images/appbar";
import SearchIcon from "@/assets/images/folder/icon-detail-search.svg";
import SortIcon from "@/assets/images/folder/icon-sort.svg";
import { AppBar, SearchBar } from "@/components/app-bar";
import { Card } from "@/components/card";
import { WishLevel } from "@/components/WishLevel";
import type { WishLevelKey } from "@/types/wish-item";

import { FolderMenu } from "./components/FolderMenu";

export type FolderDetailItem = {
  id: string;
  name: string;
  price: number | string | null;
  brand?: string | null;
  thumbnailUrl?: string | null;
  thumbnailSource?: ImageSource | number;
  isOwned?: boolean;
};

type FolderDetailScreenProps = {
  folderName: string;
  items?: FolderDetailItem[];
  savedItemCount?: number;
  levels?: { high: number; medium: number; low: number };
  /** FLD-004 나의 소장템은 위시레벨 필터와 더보기 메뉴를 숨기고 카드에 Dim을 넣지 않는다. */
  isOwnedFolder?: boolean;
  isOldestFirst?: boolean;
  onToggleSort?: () => void;
  /** 입력이 멈추거나 검색을 누르면 넘긴다. 빈 문자열이면 검색을 푼다. */
  onSubmitSearch?: (query: string) => void;
  wishLevel?: WishLevelKey | null;
  onSelectWishLevel?: (level: WishLevelKey) => void;
  onEndReached?: () => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onBack?: () => void;
  onSearch?: () => void;
  onPressMenu?: () => void;
  onEditFolder?: () => void;
  onDeleteFolder?: () => void;
  onOpenItem?: (item: FolderDetailItem) => void;
};

const SEARCH_DELAY_MS = 300;

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
  isOwnedFolder = false,
  isOldestFirst = false,
  onToggleSort,
  onSubmitSearch,
  wishLevel = null,
  onSelectWishLevel,
  onEndReached,
  isRefreshing = false,
  onRefresh,
  onBack,
  onSearch,
  onPressMenu,
  onEditFolder,
  onDeleteFolder,
  onOpenItem,
}: FolderDetailScreenProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hasSearchResults = submittedQuery.length > 0;

  // ALL 검색(ALL-004)처럼 입력을 멈추면 검색한다. 글자마다 요청하지 않도록 잠깐 기다린다.
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = searchQuery.trim();
      setSubmittedQuery(query);
      onSubmitSearch?.(query);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchQuery, onSubmitSearch]);
  const fillerCount = (3 - (items.length % 3)) % 3;
  const rows: (FolderDetailItem | null)[] = [
    ...items,
    ...Array.from({ length: fillerCount }, () => null),
  ];

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      {isSearching ? (
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onClear={() => {
            setSearchQuery("");
            setSubmittedQuery("");
            onSubmitSearch?.("");
          }}
          onSubmitEditing={() => {
            const query = searchQuery.trim();
            if (!query) return;
            setSearchQuery(query);
            setSubmittedQuery(query);
            onSubmitSearch?.(query);
            Keyboard.dismiss();
          }}
          placeholder="찾고 싶은 아이템을 입력하세요"
          accessibilityLabel="폴더 내 아이템 검색어"
          onBack={() => {
            Keyboard.dismiss();
            setSearchQuery("");
            setSubmittedQuery("");
            onSubmitSearch?.("");
            if (!hasSearchResults) setIsSearching(false);
          }}
        />
      ) : (
        <AppBar
          title={folderName}
          isTitleLeftAligned
          onBack={onBack}
          right={
            <>
              <AppBar.IconButton
                icon={DetailSearchIcon}
                accessibilityLabel="폴더 내 아이템 검색"
                onPress={() => {
                  setIsSearching(true);
                  onSearch?.();
                }}
              />
              {isOwnedFolder ? null : (
                <AppBar.IconButton
                  icon={IconKebab}
                  iconSize={24}
                  accessibilityLabel="폴더 상세 더보기"
                  onPress={() => {
                    setIsMenuOpen(true);
                    onPressMenu?.();
                  }}
                />
              )}
            </>
          }
        />
      )}
      <>
        <View className="gap-2 px-4 pt-4">
          <Text className="text-gray-1000 font-label-12-semibold">
            {hasSearchResults ? "검색된 아이템" : "저장한 아이템"}{" "}
            {(hasSearchResults ? items.length : savedItemCount).toLocaleString("ko-KR")}개
          </Text>
          <View className="h-12 flex-row items-center justify-between">
            <View className="h-12 justify-center">
              {isOwnedFolder ? null : (
                <WishLevel
                  levels={levels}
                  label="위시레벨"
                  selected={wishLevel}
                  onSelect={onSelectWishLevel}
                />
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${isOldestFirst ? "오래된 순" : "최신 순"}, 정렬 변경`}
              className="h-12 flex-row items-center gap-1 active:opacity-75"
              onPress={onToggleSort}
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
          onEndReached={onEndReached}
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          renderItem={({ item }) =>
            item ? (
              <Card
                {...item}
                hasOwnedDim={!isOwnedFolder}
                className="h-40 flex-1"
                onPress={onOpenItem ? () => onOpenItem(item) : undefined}
              />
            ) : (
              <View className="flex-1" />
            )
          }
        />
      </>
      {isMenuOpen && (
        <FolderMenu
          placement="header"
          anchor={{ x: width - 64, y: insets.top, width: 48, height: 56 }}
          onClose={() => setIsMenuOpen(false)}
          onEdit={onEditFolder}
          onDelete={onDeleteFolder}
        />
      )}
    </SafeAreaView>
  );
}
