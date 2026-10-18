import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useLayoutEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { IconNotification, IconSearch } from "@/assets/images/appbar";
import PlusIcon from "@/assets/images/folder/icon-folder-plus.svg";
import FabGlow from "@/assets/images/folder/image-fab-glow.svg";
import { AppBar } from "@/components/app-bar";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { FirstVisitGuide } from "@/components/FirstVisitGuide";
import { ItemSaveFlow } from "@/components/ItemSaveFlow";
import { ActionModal } from "@/components/modal";
import { WishItemGrid } from "@/components/WishItemGrid";
import { WishLevel } from "@/components/WishLevel";
import { selectDeletedMessage, STATE_MESSAGES, TOAST_MESSAGES } from "@/constants/messages";
import { useFirstVisitGuide } from "@/hooks/useFirstVisitGuide";
import { useItemSave } from "@/hooks/useItemSave";
import { useProductCounts } from "@/hooks/useProductCounts";
import { useProductList } from "@/hooks/useProductList";
import { useToast } from "@/hooks/useToast";
import { ItemLinkSheet } from "@/screens/save/components/ItemLinkSheet";
import type { WishItem, WishLevelKey } from "@/types/wish-item";

import { DeleteBar } from "./components/DeleteBar";
import { SelectModeBar } from "./components/SelectModeBar";
import { SortLabel, type SortOrder } from "./components/SortLabel";
import { useDeleteProducts } from "./mutations/useDeleteProducts";

const EMPTY_LEVELS = { high: 0, medium: 0, low: 0 };

const WISH_LEVEL_HINT =
  "아이템 상세 화면에서 얼마나 사고 싶은지를 3단계로 기록해두어 구매 고민을 빠르게 마칠 수 있습니다.";

export function AllScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const showToast = useToast();
  const guide = useFirstVisitGuide("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("latest");
  const [wishLevel, setWishLevel] = useState<WishLevelKey | null>(null);
  // 저장 직후 들어오면 오래된 순·다른 위시레벨 필터에 가려 새 아이템이 안 보일 수 있어 기본으로 되돌린다.
  const { savedAt } = useLocalSearchParams<{ savedAt?: string }>();
  const [handledSavedAt, setHandledSavedAt] = useState(savedAt);
  if (savedAt !== handledSavedAt) {
    setHandledSavedAt(savedAt);
    setSortOrder("latest");
    setWishLevel(null);
  }

  const list = useProductList(sortOrder, wishLevel);
  const counts = useProductCounts();
  const deleteProducts = useDeleteProducts();
  const items = list.data?.pages.flat() ?? [];
  const totalCount = counts.data?.total ?? 0;
  const shownCount = wishLevel ? (counts.data?.levels[wishLevel] ?? 0) : totalCount;
  // 빈 화면 시안에는 상단 영역이 없다. 개수로 먼저 판단해야 상단이 잠깐 보였다 사라지지 않는다.
  // 필터 결과가 비었을 때는 필터를 풀 수 있게 상단을 남긴다.
  const isEmpty = wishLevel === null && totalCount === 0;

  const [isSelectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<"cancel" | "delete" | null>(null);
  const [isLinkSheetOpen, setLinkSheetOpen] = useState(false);
  // 열 때마다 입력을 비우려고 키를 바꾼다. 닫을 때 바꾸면 닫힘 애니메이션 없이 사라져 onDismiss 가 오지 않는다.
  const [linkSheetKey, setLinkSheetKey] = useState(0);
  // 링크 시트가 다 닫힌 뒤 불러올 링크. iOS 는 닫히는 중에 띄운 로딩 모달을 무시한다.
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const itemSave = useItemSave();

  const selectedCount = selectedIds.size;
  const isAllSelected = items.length > 0 && selectedCount === items.length;

  // 선택 모드에서는 DeleteBar 가 탭바 자리를 대신한다.
  useLayoutEffect(() => {
    navigation
      .getParent()
      ?.setOptions({ tabBarStyle: isSelectMode ? { display: "none" } : undefined });
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
    deleteProducts.mutate([...selectedIds], {
      onSuccess: () => {
        showToast(selectDeletedMessage(selectedCount));
        exitSelectMode();
      },
      onError: () => {
        setConfirming(null);
        showToast(TOAST_MESSAGES.ALL_008);
      },
    });
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
                onPress={() => router.push("/all/search")}
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

      {guide.isVisible ? (
        <View className="flex-1" />
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
      ) : isEmpty ? (
        <EmptyState message={STATE_MESSAGES.allEmpty} />
      ) : (
        <WishItemGrid
          // 저장 직후에는 새로 그려 맨 위부터 보여 준다.
          key={savedAt}
          items={items}
          isLoading={list.isPending}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          selectedIds={isSelectMode ? selectedIds : undefined}
          onItemPress={(item) =>
            isSelectMode ? toggleItem(item) : router.push(`/items/${item.id}`)
          }
          header={
            <View className="gap-2 pt-4">
              <View className="h-[21px] flex-row items-center justify-between">
                <Text className="text-gray-1000 font-label-12-semibold">
                  저장한 아이템 {shownCount}개
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
                  <WishLevel
                    hasScrim
                    levels={counts.data?.levels ?? EMPTY_LEVELS}
                    hint={WISH_LEVEL_HINT}
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

      {isSelectMode ? (
        <DeleteBar selectedCount={selectedCount} onPress={() => setConfirming("delete")} />
      ) : null}

      <ItemLinkSheet
        key={`link-${linkSheetKey}`}
        visible={isLinkSheetOpen}
        onRequestClose={() => setLinkSheetOpen(false)}
        onSubmit={(url) => {
          setLinkSheetOpen(false);
          // 안드로이드는 이어서 띄워도 무시되지 않아 기다릴 필요가 없다.
          if (Platform.OS === "ios") setPendingUrl(url);
          else void itemSave.start(url);
        }}
        onDismiss={() => {
          if (pendingUrl === null) return;
          void itemSave.start(pendingUrl);
          setPendingUrl(null);
        }}
      />

      <ItemSaveFlow itemSave={itemSave} />

      <ActionModal
        visible={confirming === "cancel"}
        onRequestClose={() => setConfirming(null)}
        type="2Btn"
        title="선택을 취소하시겠습니까?"
        description="선택한 아이템이 모두 해제됩니다."
        secondaryAction={{ label: "계속 선택", onPress: () => setConfirming(null) }}
        primaryAction={{ label: "선택 취소", onPress: exitSelectMode }}
      />

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
            onPress={() => {
              setLinkSheetKey((key) => key + 1);
              setLinkSheetOpen(true);
            }}
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
        primaryAction={{
          label: "삭제하기",
          isDisabled: deleteProducts.isPending,
          onPress: handleDelete,
        }}
      />
      {guide.isVisible && <FirstVisitGuide kind="all" onClose={guide.dismiss} />}
    </View>
  );
}
