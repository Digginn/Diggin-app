import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { HelperText, SearchField } from "@/components/Field";
import { Spinner } from "@/components/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { usePostDraft } from "@/contexts/PostDraftContext";
import { useProductCounts } from "@/hooks/useProductCounts";
import { useProductList } from "@/hooks/useProductList";
import type { PostItem } from "@/types/post";

import { MAX_ATTACH_COUNT } from "./components/ProductAttachGrid";
import { SelectCard } from "./components/SelectCard";

const COLUMN_COUNT = 3;
const COLUMN_GAP = 12;
const ROW_GAP = 20;
const SCREEN_PADDING = 15;

export function ItemSelectScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const maxAttachCount = type === "vote" ? 1 : MAX_ATTACH_COUNT;
  const insets = useSafeAreaInsets();
  const { items: attached, setItems } = usePostDraft();
  const [keyword, setKeyword] = useState("");
  // 검색어가 바뀌어도 이미 고른 아이템은 선택 상태를 유지함
  const [selected, setSelected] = useState<PostItem[]>(attached.slice(0, maxAttachCount));
  const selectedIds = selected.map((item) => item.id);
  const [isKeyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());

  const searchKeyword = keyword.trim();
  const { session } = useAuth();
  const [selectionOwner, setSelectionOwner] = useState(session?.user.id);
  if (selectionOwner !== session?.user.id) {
    setSelectionOwner(session?.user.id);
    setSelected([]);
  }
  const products = useProductList("latest", null, searchKeyword, !!session);
  const counts = useProductCounts(searchKeyword, !!session);
  const results = (products.data?.pages.flat() ?? []).map((item) => ({
    ...item,
    imageUrl: item.thumbnailUrl,
  }));
  // ALL 목록과 같이 마지막 행을 채워 검색 결과가 1~2개여도 세 열 너비를 유지한다.
  const gridItems = [
    ...results,
    ...Array.from(
      { length: (COLUMN_COUNT - (results.length % COLUMN_COUNT)) % COLUMN_COUNT },
      () => null,
    ),
  ];

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  function toggle(item: PostItem) {
    setSelected((prev) =>
      prev.some((selectedItem) => selectedItem.id === item.id)
        ? prev.filter((selectedItem) => selectedItem.id !== item.id)
        : maxAttachCount === 1
          ? [item]
          : prev.length < maxAttachCount
            ? [...prev, item]
            : prev,
    );
  }

  return (
    <KeyboardAvoidingView
      // Android edge-to-edge 환경에서도 하단 버튼이 키보드 위로 올라오도록 높이를 보정한다.
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="bg-gray-0"
      // className의 flex가 KeyboardAvoidingView 내부의 동적 flex: 0을 덮지 않게 한다.
      style={{ flex: 1 }}
    >
      <AppBar title="아이템 선택" onBack={() => router.back()} />

      <View className="px-margin pt-1">
        <SearchField
          value={keyword}
          onChangeText={setKeyword}
          placeholder="아이템명, 브랜드명으로 검색"
        />
      </View>

      <View className="w-full flex-row items-center justify-between px-margin py-3">
        {keyword ? (
          <Text className="text-gray-700 font-b3">{`'${keyword}' 검색 결과${counts.data && !counts.isPlaceholderData ? ` ${counts.data.total}개` : " 조회 중"}`}</Text>
        ) : (
          <HelperText
            className="flex-1"
            message={
              maxAttachCount === 1
                ? "1개만 선택할 수 있습니다."
                : `최대 ${maxAttachCount}개까지 선택할 수 있습니다.`
            }
          />
        )}
        <Text className="text-gray-900 font-meta">
          {selectedIds.length}/{maxAttachCount}
        </Text>
      </View>

      <FlatList
        data={products.isPlaceholderData ? [] : gridItems}
        refreshing={products.isRefetching && !products.isFetchingNextPage}
        onRefresh={() => void products.refetch()}
        onEndReached={() => {
          if (products.hasNextPage && !products.isFetching && !products.isFetchNextPageError)
            void products.fetchNextPage();
        }}
        ListEmptyComponent={
          products.isPending || products.isPlaceholderData ? (
            <Spinner />
          ) : (
            <Text className="py-8 text-center text-gray-500 font-b3">
              {products.isError ? "아이템을 불러오지 못했습니다." : "선택할 아이템이 없습니다."}
            </Text>
          )
        }
        ListFooterComponent={
          products.isError ? (
            <Button
              onPress={() => {
                if (products.isFetchNextPageError) void products.fetchNextPage();
                else void products.refetch();
              }}
            >
              다시 시도
            </Button>
          ) : products.isFetchingNextPage ? (
            <Spinner />
          ) : null
        }
        numColumns={COLUMN_COUNT}
        keyExtractor={(item, index) => item?.id ?? `empty-${index}`}
        keyboardShouldPersistTaps="handled"
        columnWrapperStyle={{ gap: COLUMN_GAP, marginBottom: ROW_GAP }}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, paddingTop: 8 }}
        renderItem={({ item }) =>
          item ? (
            <SelectCard
              item={item}
              name={item.name}
              price={item.price}
              brand={item.brand}
              isSelected={selectedIds.includes(item.id)}
              onToggle={() => toggle(item)}
            />
          ) : (
            <View className="flex-1" />
          )
        }
      />

      <View
        className="w-full border-t border-gray-200 bg-gray-0 px-margin pt-3"
        style={{ paddingBottom: isKeyboardVisible ? 12 : Math.max(insets.bottom, 12) }}
      >
        <Button
          size="large"
          isDisabled={!session || selectedIds.length === 0}
          onPress={() => {
            Keyboard.dismiss();
            setItems(selected);
            router.back();
          }}
        >
          {`첨부하기(${selected.length}/${maxAttachCount}개)`}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
