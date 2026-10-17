import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { cssInterop } from "nativewind";
import { useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconBack } from "@/assets/images/appbar";
import ShareSvg from "@/assets/images/icon-share.svg";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { FallbackImg } from "@/components/FallbackImg";
import { FirstVisitGuide } from "@/components/FirstVisitGuide";
import { LoadingDialog } from "@/components/Loading";
import { WishLevel } from "@/components/WishLevel";
import { STATE_MESSAGES, TOAST_MESSAGES, selectFolderSavedMessage } from "@/constants/messages";
import { useCreateFolder } from "@/hooks/useCreateFolder";
import { useFirstVisitGuide } from "@/hooks/useFirstVisitGuide";
import { useFolders } from "@/hooks/useFolders";
import { useProductCounts } from "@/hooks/useProductCounts";
import { useToast } from "@/hooks/useToast";
import type { WishItem, WishLevelCounts } from "@/types/wish-item";

import { EditChip } from "./components/EditChip";
import { FolderManageButton } from "./components/FolderManageButton";
import { FolderManageSheet } from "./components/FolderManageSheet";
import { ItemEditSheet } from "./components/ItemEditSheet";
import { ItemInfo } from "./components/ItemInfo";
import { RecommendSection } from "./components/RecommendSection";
import { VotePrompt } from "./components/VotePrompt";
import { useIsImageDark } from "./hooks/useIsImageDark";
import { useSaveProductFolders } from "./mutations/useSaveProductFolders";
import { useUpdateProduct } from "./mutations/useUpdateProduct";
import { useProduct } from "./queries/useProduct";
import { useProductFolderIds } from "./queries/useProductFolderIds";

const StyledImage = cssInterop(Image, { className: "style" });
const ShareIcon = cssInterop(ShareSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

// HERO_FRAME의 높이와 같아야 한다. 뒤로가기 뒤 밝기를 잴 때 쓴다.
const HERO_HEIGHT = 520;
const HERO_FRAME = "h-[520px] w-full bg-gray-10 ";

// MVP 에서 추천 아이템을 빼기로 하면서 그만큼 이미지가 커졌다.
// 다시 넣을 때 true 로 바꾸면 된다.
const SHOWS_RECOMMEND = false;

const EMPTY_LEVELS: WishLevelCounts = { high: 0, medium: 0, low: 0 };

// TODO: 추천 아이템 API 연결 전까지 쓰는 임시 데이터.
const MOCK_RECOMMENDS: WishItem[] = Array.from({ length: 9 }, (_, index) => ({
  id: `recommend-${index}`,
  name: "아이템명",
  price: 0,
  brand: "브랜드명",
  thumbnailUrl: null,
}));

export function ItemDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const guide = useFirstVisitGuide("item-detail");
  const showToast = useToast();
  const wishGuideRef = useRef<View>(null);
  const voteGuideRef = useRef<View>(null);
  const { id } = useLocalSearchParams<{ id: string }>();
  const product = useProduct(id);
  const counts = useProductCounts();
  const updateProduct = useUpdateProduct(id);
  const item = product.data?.values;
  const isOwned = product.data?.isOwned ?? false;
  const [failed, setFailed] = useState(false);
  const [isEditOpen, setEditOpen] = useState(false);
  const [bottomHeight, setBottomHeight] = useState(0);
  const [isFolderOpen, setFolderOpen] = useState(false);
  const folders = useFolders();
  const folderIds = useProductFolderIds(id);
  const createFolder = useCreateFolder();
  const saveFolders = useSaveProductFolders(id);
  const ownedFolderId = folders.data?.find((folder) => folder.isOwnedItems)?.id;
  const thumbnail = item?.thumbnailUrl && !failed ? item.thumbnailUrl : undefined;
  const { width: windowWidth } = useWindowDimensions();
  const isBackAreaDark = useIsImageDark(
    thumbnail,
    { width: windowWidth, height: HERO_HEIGHT },
    { x: 0, y: insets.top, width: 48, height: 48 },
  );

  if (product.isError) {
    return (
      <View className="flex-1 bg-gray-0" style={{ paddingTop: insets.top }}>
        <AppBar.IconButton
          icon={IconBack}
          accessibilityLabel="뒤로 가기"
          onPress={() => router.back()}
        />
        <ErrorState message={STATE_MESSAGES.loadFailed} onRetry={() => void product.refetch()} />
      </View>
    );
  }

  if (!item) {
    return (
      <View className="flex-1 bg-gray-0">
        <LoadingDialog visible message="아이템 정보를 불러오는 중입니다." />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-0">
      <ScrollView contentContainerStyle={{ paddingBottom: bottomHeight }}>
        <View className="relative">
          {thumbnail ? (
            <StyledImage
              className={HERO_FRAME}
              contentFit="cover"
              onError={() => setFailed(true)}
              source={thumbnail}
            />
          ) : (
            <FallbackImg size="detail" className={HERO_FRAME} />
          )}

          <LinearGradient
            colors={["transparent", "rgba(0, 0, 0, 0.5)"]}
            locations={[0.8, 1]}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
          />

          {/* TODO: 추천 영역의 폴더 드롭다운은 Dropdown 에 배경 옵션이 생기면 붙인다. */}
          <View className="absolute left-0 top-0" style={{ paddingTop: insets.top }}>
            <AppBar.IconButton
              icon={IconBack}
              accessibilityLabel="뒤로 가기"
              onPress={() => router.back()}
              disabled={isEditOpen || isFolderOpen}
              className={
                isEditOpen || isFolderOpen
                  ? "text-gray-400"
                  : isBackAreaDark
                    ? "text-gray-0"
                    : "text-gray-900"
              }
            />
          </View>

          {/* PDT-001 나의 소장템 상품은 위시레벨이 없어 표시하지 않는다. */}
          <View
            ref={wishGuideRef}
            collapsable={false}
            className="absolute bottom-3 left-[17px] h-12 justify-center"
          >
            {isOwned ? null : (
              <WishLevel
                levels={counts.data?.levels ?? EMPTY_LEVELS}
                openDirection="up"
                selected={item.wishLevel}
                onSelect={(level) =>
                  updateProduct.mutate(
                    { wishLevel: level },
                    { onError: () => showToast(TOAST_MESSAGES.ALL_005) },
                  )
                }
                hint={
                  "얼마나 사고 싶은지를 3단계로 기록해두어\nALL 탭에서 빠르게 분류할 수 있습니다."
                }
              />
            )}
          </View>

          <Pressable
            accessibilityLabel="공유하기"
            accessibilityRole="button"
            className="absolute bottom-5 right-4 size-8 items-center justify-center rounded-full border border-gray-300 bg-gray-0 active:opacity-75"
            hitSlop={8}
            onPress={() => {}}
          >
            <ShareIcon className="size-7" />
          </Pressable>
        </View>

        <View className="gap-6 pt-4">
          <View className="gap-[13px] px-4">
            <View className="w-full flex-row items-center justify-between gap-2">
              <Text numberOfLines={1} className="flex-1 text-gray-1000 font-label-14">
                {item.brand}
              </Text>
              <EditChip onPress={() => setEditOpen(true)} />
            </View>
            <ItemInfo
              name={item.name}
              price={item.price === "" ? null : Number(item.price)}
              sourceUrl={item.sourceUrl}
            />
          </View>
          {SHOWS_RECOMMEND ? (
            <RecommendSection
              items={MOCK_RECOMMENDS}
              onItemPress={(recommend) => router.push(`/items/${recommend.id}`)}
            />
          ) : null}
        </View>
      </ScrollView>

      <ItemEditSheet
        key={isEditOpen ? "open" : "closed"}
        visible={isEditOpen}
        initialValues={item}
        onRequestClose={() => setEditOpen(false)}
        onSubmit={(values) =>
          updateProduct.mutate(
            {
              name: values.name,
              brand: values.brand,
              price: values.price,
              // 소장 상품에 위시레벨을 넣으면 서버가 거부한다(PDT-008).
              wishLevel: isOwned ? undefined : values.wishLevel,
            },
            {
              onSuccess: () => {
                setEditOpen(false);
                showToast(TOAST_MESSAGES.ALL_004);
              },
              onError: () => showToast(TOAST_MESSAGES.ALL_005),
            },
          )
        }
      />

      {isFolderOpen && folders.data && folderIds.data && ownedFolderId && (
        <FolderManageSheet
          folders={folders.data}
          selectedFolderIds={folderIds.data}
          onClose={() => setFolderOpen(false)}
          onCreateFolder={(name) => createFolder.mutateAsync(name)}
          onComplete={(ids) =>
            saveFolders.mutate(
              { ownedFolderId, before: folderIds.data, after: ids },
              {
                onSuccess: () => {
                  setFolderOpen(false);
                  showToast(selectFolderSavedMessage(ids.length));
                },
                onError: () => showToast(TOAST_MESSAGES.SYS_002),
              },
            )
          }
        />
      )}

      <View
        className="absolute inset-x-0 bottom-0"
        onLayout={(event) => setBottomHeight(event.nativeEvent.layout.height)}
      >
        <View ref={voteGuideRef} collapsable={false}>
          <VotePrompt onPress={() => router.push("/diggle")} />
        </View>

        <View className="flex-row gap-gutter border-t border-gray-200 bg-gray-0 px-margin pb-10 pt-3">
          <View className="flex-1">
            <Button
              variant="secondary"
              onPress={() =>
                Linking.openURL(item.sourceUrl).catch(() => showToast(TOAST_MESSAGES.ALL_009))
              }
            >
              웹사이트 이동
            </Button>
          </View>
          <View className="flex-1">
            <FolderManageButton
              folderCount={folderIds.data?.length ?? 0}
              onPress={() => setFolderOpen(true)}
            />
          </View>
        </View>
      </View>
      {guide.isVisible && (
        <FirstVisitGuide
          kind="item-detail"
          targets={{ wish: wishGuideRef, vote: voteGuideRef }}
          onClose={guide.dismiss}
        />
      )}
    </View>
  );
}
