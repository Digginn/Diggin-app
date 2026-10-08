import { useNavigation, useRouter } from "expo-router";
import { useLayoutEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { IconNotification, IconSearch } from "@/assets/images/appbar";
import PlusIcon from "@/assets/images/folder/icon-folder-plus.svg";
import FabGlow from "@/assets/images/folder/image-fab-glow.svg";
import { AppBar } from "@/components/app-bar";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ActionModal } from "@/components/modal";
import { WishItemGrid } from "@/components/WishItemGrid";
import { WishLevel } from "@/components/WishLevel";
import { selectDeletedMessage, STATE_MESSAGES, TOAST_MESSAGES } from "@/constants/messages";
import { useToast } from "@/hooks/useToast";
import { ItemLinkSheet } from "@/screens/save/components/ItemLinkSheet";
import { ItemSaveSheet, type ItemSaveValues } from "@/screens/save/components/ItemSaveSheet";
import type { WishItem, WishLevelCounts } from "@/types/wish-item";

import { DeleteBar } from "./components/DeleteBar";
import { SelectModeBar } from "./components/SelectModeBar";
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

const EMPTY_SAVE_VALUES: ItemSaveValues = {
  name: "",
  brand: "",
  price: "",
  sourceUrl: "",
  thumbnailUrl: null,
  wishLevel: null,
};

const WISH_LEVEL_HINT =
  "아이템 상세 화면에서 얼마나 사고 싶은지를 3단계로 기록해두어 구매 고민을 빠르게 마칠 수 있습니다.";

export function AllScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const showToast = useToast();
  const [sortOrder, setSortOrder] = useState<SortOrder>("latest");

  // TODO: TanStack Query 연결 시 쿼리의 로딩 · 에러 상태와 뮤테이션으로 바꾼다.
  const [items, setItems] = useState(MOCK_ITEMS);
  const isLoading = false;
  const hasError = false;

  const [isSelectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<"cancel" | "delete" | null>(null);
  const [isLinkSheetOpen, setLinkSheetOpen] = useState(false);
  const [saveValues, setSaveValues] = useState<ItemSaveValues | null>(null);

  const selectedCount = selectedIds.size;
  const isAllSelected = items.length > 0 && selectedCount === items.length;

  // 선택 모드에서는 DeleteBar 가 탭바 자리를 대신한다.
  useLayoutEffect(() => {
    navigation.setOptions({ tabBarStyle: isSelectMode ? { display: "none" } : undefined });
  }, [navigation, isSelectMode]);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setConfirming(null);
  }

  function toggleItem(item: WishItem) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      // 선택된 카드를 다시 누르면 해제된다.
      if (!next.delete(item.id)) next.add(item.id);
      return next;
    });
  }

  function handleCancel() {
    // 고른 게 없으면 되돌릴 것도 없으니 바로 빠져나간다.
    if (selectedCount === 0) exitSelectMode();
    else setConfirming("cancel");
  }

  function handleDelete() {
    setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
    showToast(selectDeletedMessage(selectedCount));
    exitSelectMode();
  }

  return (
    <View className="flex-1 bg-gray-0">
      {isSelectMode ? (
        <SelectModeBar
          selectedCount={selectedCount}
          isAllSelected={isAllSelected}
          onCancel={handleCancel}
          onToggleAll={() =>
            setSelectedIds(isAllSelected ? new Set() : new Set(items.map((item) => item.id)))
          }
        />
      ) : (
        <AppBar
          left="logo"
          right={
            <>
              <AppBar.IconButton
                icon={IconSearch}
                accessibilityLabel="검색"
                onPress={() => router.push("/search")}
              />
              <AppBar.IconButton
                icon={IconNotification}
                accessibilityLabel="알림"
                onPress={() => router.push("/notifications")}
              />
            </>
          }
        />
      )}

      {hasError ? (
        <ErrorState message={STATE_MESSAGES.loadFailed} onRetry={() => {}} />
      ) : items.length === 0 && !isLoading ? (
        <EmptyState message={STATE_MESSAGES.allEmpty} />
      ) : (
        <WishItemGrid
          items={items}
          isLoading={isLoading}
          selectedIds={isSelectMode ? selectedIds : undefined}
          onItemPress={(item) =>
            isSelectMode ? toggleItem(item) : router.push(`/items/${item.id}`)
          }
          header={
            <View className="gap-2 pt-4">
              <View className="h-[21px] flex-row items-center justify-between">
                <Text className="text-gray-1000 font-label-12-semibold">
                  저장한 아이템 {items.length}개
                </Text>
                {/* 선택 모드에서는 상단 바가 취소 · 전체 선택을 맡으므로 숨긴다. */}
                {!isSelectMode && items.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    className="active:opacity-75"
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    onPress={() => setSelectMode(true)}
                  >
                    <Text className="text-gray-900 font-label-14">선택</Text>
                  </Pressable>
                ) : null}
              </View>
              <View className="h-12 flex-row items-center justify-between">
                <View>
                  <WishLevel hasScrim levels={MOCK_LEVELS} hint={WISH_LEVEL_HINT} />
                </View>
                <SortLabel value={sortOrder} onChange={setSortOrder} />
              </View>
            </View>
          }
        />
      )}

      {isSelectMode ? (
        <DeleteBar selectedCount={selectedCount} onPress={() => setConfirming("delete")} />
      ) : null}

      <ItemLinkSheet
        key={isLinkSheetOpen ? "open" : "closed"}
        visible={isLinkSheetOpen}
        onRequestClose={() => setLinkSheetOpen(false)}
        onSubmit={(url) => {
          setLinkSheetOpen(false);
          // TODO: 크롤링이 붙으면 불러온 이름 · 브랜드 · 가격 · 이미지를 채워 넘긴다.
          setSaveValues({
            name: "",
            brand: "",
            price: "",
            sourceUrl: url,
            thumbnailUrl: null,
            wishLevel: null,
          });
        }}
      />

      <ItemSaveSheet
        key={saveValues?.sourceUrl ?? "closed"}
        visible={saveValues !== null}
        // 크롤링 전까지는 값이 비어 있어 직접 입력하는 흐름으로 연다.
        hasExtractionFailed
        initialValues={saveValues ?? EMPTY_SAVE_VALUES}
        onRequestClose={() => setSaveValues(null)}
        onSubmit={() => {
          setSaveValues(null);
          showToast(TOAST_MESSAGES.SAVE_011);
        }}
      />

      <ActionModal
        visible={confirming === "cancel"}
        onRequestClose={() => setConfirming(null)}
        type="2Btn"
        title="선택을 취소하시겠습니까?"
        description="선택한 아이템이 모두 해제됩니다."
        secondaryAction={{ label: "계속 선택", onPress: () => setConfirming(null) }}
        primaryAction={{ label: "선택 취소", onPress: exitSelectMode }}
      />

      {/* 시안 FAB 는 200 박스 안에 흰 그라디언트와 54 버튼이 들어간다. 폴더 탭과 같은 배치다. */}
      {!isSelectMode ? (
        <View
          pointerEvents="box-none"
          className="absolute -bottom-[49px] -right-[49px] z-20 size-[200px]"
        >
          <View pointerEvents="none" className="absolute inset-0">
            <FabGlow />
          </View>
          <Pressable
            accessibilityLabel="아이템 추가"
            accessibilityRole="button"
            className="absolute left-[73px] top-[73px] size-[54px] items-center justify-center rounded-full bg-gray-900 shadow-[0_4px_20px_rgba(0,0,0,0.1)] active:opacity-75"
            onPress={() => setLinkSheetOpen(true)}
          >
            <PlusIcon />
          </Pressable>
        </View>
      ) : null}

      <ActionModal
        visible={confirming === "delete"}
        onRequestClose={() => setConfirming(null)}
        type="2Btn"
        title={`${selectedCount}개 아이템을 삭제하시겠습니까?`}
        description={
          "삭제한 아이템은 복구할 수 없습니다.\n게시글·투표에 올린 아이템 정보는 유지됩니다."
        }
        secondaryAction={{ label: "취소", onPress: () => setConfirming(null) }}
        primaryAction={{ label: "삭제하기", onPress: handleDelete }}
      />
    </View>
  );
}
