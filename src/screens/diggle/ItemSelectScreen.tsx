import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { HelperText, SearchField } from "@/components/Field";
import { usePostDraft } from "@/contexts/PostDraftContext";
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

const MOCK_VOTE_ITEMS = MOCK_ITEMS.map((item, index) => ({
  ...item,
  name: ["미니 토트백", "캔버스 숄더 가방", "레더 크로스백"][index] ?? item.name,
  searchKeywords: index < 3 ? "가방" : "",
}));

export function ItemSelectScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const maxAttachCount = type === "vote" ? 1 : MAX_ATTACH_COUNT;
  const insets = useSafeAreaInsets();
  const { items: attached, setItems } = usePostDraft();
  const [keyword, setKeyword] = useState("");
  // 검색어가 바뀌어도 이미 고른 아이템은 선택 상태를 유지함
  const [selectedIds, setSelectedIds] = useState<string[]>(
    attached.slice(0, maxAttachCount).map((item) => item.id),
  );
  const [isKeyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());

  const availableItems = type === "vote" ? MOCK_VOTE_ITEMS : MOCK_ITEMS;
  const searchKeyword = keyword.trim();
  const results = searchKeyword
    ? availableItems.filter(
        (item) =>
          item.name.includes(searchKeyword) ||
          item.brand.includes(searchKeyword) ||
          ("searchKeywords" in item &&
            typeof item.searchKeywords === "string" &&
            item.searchKeywords.includes(searchKeyword)),
      )
    : availableItems;

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
    setSelectedIds((prev) =>
      prev.includes(item.id)
        ? prev.filter((id) => id !== item.id)
        : maxAttachCount === 1
          ? [item.id]
          : prev.length < maxAttachCount
            ? [...prev, item.id]
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
          <Text className="text-gray-700 font-b3">{`'${keyword}' 검색 결과 ${results.length}개`}</Text>
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

      <View
        className="w-full border-t border-gray-200 bg-gray-0 px-margin pt-3"
        style={{ paddingBottom: isKeyboardVisible ? 12 : Math.max(insets.bottom, 12) }}
      >
        <Button
          size="large"
          isDisabled={selectedIds.length === 0}
          onPress={() => {
            Keyboard.dismiss();
            setItems(availableItems.filter((item) => selectedIds.includes(item.id)));
            router.back();
          }}
        >
          첨부하기
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
