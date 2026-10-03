import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Text, View } from "react-native";

import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { HelperText, SearchField } from "@/components/Field";
import type { PostItem } from "@/types/post";

import { MAX_ATTACH_COUNT } from "./components/ProductAttachGrid";
import { SelectCard } from "./components/SelectCard";

const COLUMN_COUNT = 3;
const COLUMN_GAP = 12;
const ROW_GAP = 20;
const SCREEN_PADDING = 15;

// TODO: API 연결 전까지 쓰는 임시 데이터.
const MOCK_ITEMS = Array.from({ length: 9 }, (_, index) => ({
  id: String(index),
  imageUrl: null,
  name: `아이템명 ${index + 1}`,
  price: 0,
  brand: "브랜드명",
}));

export function ItemSelectScreen() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  // 검색어가 바뀌어도 이미 고른 아이템은 선택 상태를 유지함
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const results = keyword
    ? MOCK_ITEMS.filter((item) => item.name.includes(keyword) || item.brand.includes(keyword))
    : MOCK_ITEMS;

  function toggle(item: PostItem) {
    setSelectedIds((prev) =>
      prev.includes(item.id)
        ? prev.filter((id) => id !== item.id)
        : prev.length < MAX_ATTACH_COUNT
          ? [...prev, item.id]
          : prev,
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-gray-0"
    >
      <AppBar title="아이템 선택" onBack={() => router.back()} />

      <View className="px-margin pt-1">
        <SearchField value={keyword} onChangeText={setKeyword} />
      </View>

      <View className="w-full flex-row items-center justify-between px-margin py-3">
        {keyword ? (
          <Text className="text-gray-700 font-b3">{`'${keyword}' 검색 결과 ${results.length}개`}</Text>
        ) : (
          <HelperText className="flex-1" message="최대 4개까지 선택할 수 있습니다." />
        )}
        <Text className="text-gray-900 font-meta">
          {selectedIds.length}/{MAX_ATTACH_COUNT}
        </Text>
      </View>

      <FlatList
        data={results}
        numColumns={COLUMN_COUNT}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        columnWrapperStyle={{ gap: COLUMN_GAP, marginBottom: ROW_GAP }}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, paddingTop: 8 }}
        renderItem={({ item }) => (
          <SelectCard
            item={item}
            name={item.name}
            price={item.price}
            brand={item.brand}
            isSelected={selectedIds.includes(item.id)}
            onToggle={() => toggle(item)}
          />
        )}
      />

      <View className="w-full border-t border-gray-200 bg-gray-0 px-margin pb-10 pt-3">
        <Button isDisabled={selectedIds.length === 0} onPress={() => router.back()}>
          첨부하기
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
