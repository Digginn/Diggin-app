import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { cssInterop } from "nativewind";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconBack } from "@/assets/images/appbar";
import ShareSvg from "@/assets/images/icon-share.svg";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { FallbackImg } from "@/components/FallbackImg";
import { LoadingDialog } from "@/components/Loading";
import { WishLevel } from "@/components/WishLevel";
import type { WishItem, WishLevelCounts } from "@/types/wish-item";

import { EditChip } from "./components/EditChip";
import { FolderManageButton } from "./components/FolderManageButton";
import { FolderManageSheet, type ManagedFolder } from "./components/FolderManageSheet";
import { ItemEditSheet, type ItemEditValues } from "./components/ItemEditSheet";
import { ItemInfo } from "./components/ItemInfo";
import { RecommendSection } from "./components/RecommendSection";
import { VotePrompt } from "./components/VotePrompt";

const StyledImage = cssInterop(Image, { className: "style" });
const ShareIcon = cssInterop(ShareSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

const HERO_FRAME = "h-[440px] w-full bg-gray-10 ";

// TODO: API 연결 전까지 쓰는 임시 데이터.
const MOCK_ITEM: ItemEditValues = {
  name: "Real Good Pants 엄청 좋은 바지",
  price: "70000",
  sourceUrl: "http://pf.kakao.com/_zIxnrX",
  thumbnailUrl: null,
  wishLevel: null,
};

const BRAND = "브랜드명";

// TODO: 폴더 목록 API 연결 전까지 쓰는 임시 값.
const MOCK_FOLDERS: ManagedFolder[] = [
  "기본 폴더",
  "바지",
  "여름휴가때입을거",
  "출근룩",
  "선물 리스트",
  "운동복",
  "홈카페",
  "겨울 코트",
  "생일 선물",
  "등산",
].map((name, index) => ({ id: `folder-${index}`, name }));

const MOCK_LEVELS: WishLevelCounts = { high: 0, medium: 0, low: 0 };

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
  // TODO: API 연결 시 이 id 로 아이템을 조회한다.
  useLocalSearchParams<{ id: string }>();

  // TODO: API 연결 시 수정 뮤테이션으로 바꾼다. 지금은 화면 안에서만 반영한다.
  const [item, setItem] = useState(MOCK_ITEM);
  const [failed, setFailed] = useState(false);
  const [isEditOpen, setEditOpen] = useState(false);
  const [bottomHeight, setBottomHeight] = useState(0);
  const [isFolderOpen, setFolderOpen] = useState(false);
  // TODO: 저장 여부는 API 연결 시 서버 값으로 바꾼다.
  const [folders, setFolders] = useState(MOCK_FOLDERS);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>(["folder-0"]);
  // TODO: TanStack Query 연결 시 쿼리의 로딩 상태로 바꾼다.
  const isLoading = false;

  const thumbnail = item.thumbnailUrl && !failed ? item.thumbnailUrl : undefined;

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

          {/* TODO: REC-05 의 폴더 드롭다운은 Dropdown 에 배경 옵션이 생기면 붙인다. */}
          <View className="absolute left-0 top-0" style={{ paddingTop: insets.top }}>
            <AppBar.IconButton
              icon={IconBack}
              accessibilityLabel="뒤로 가기"
              onPress={() => router.back()}
            />
          </View>

          <View className="absolute bottom-3 left-[17px] h-12 justify-center">
            <WishLevel
              levels={MOCK_LEVELS}
              openDirection="up"
              hint={
                "얼마나 사고 싶은지를 3단계로 기록해두어\nALL 탭에서 빠르게 분류할 수 있습니다."
              }
            />
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
            <View className="w-full flex-row items-center justify-between">
              <Text className="text-gray-1000 font-label-14">{BRAND}</Text>
              <EditChip onPress={() => setEditOpen(true)} />
            </View>
            <ItemInfo name={item.name} price={Number(item.price)} sourceUrl={item.sourceUrl} />
          </View>
          <RecommendSection
            items={MOCK_RECOMMENDS}
            onItemPress={(recommend) => router.push(`/items/${recommend.id}`)}
          />
        </View>
      </ScrollView>

      <ItemEditSheet
        key={isEditOpen ? "open" : "closed"}
        visible={isEditOpen}
        initialValues={item}
        onRequestClose={() => setEditOpen(false)}
        onSubmit={(values) => {
          setItem(values);
          setFailed(false);
          setEditOpen(false);
        }}
      />

      <LoadingDialog visible={isLoading} message="상품 정보를 불러오는 중입니다." />

      {isFolderOpen && (
        <FolderManageSheet
          folders={folders}
          selectedFolderIds={selectedFolderIds}
          onClose={() => setFolderOpen(false)}
          onCreateFolder={(name) => {
            const folder = { id: `created-${Date.now()}`, name };
            setFolders((previous) => [folder, ...previous]);
            return folder;
          }}
          onComplete={(ids) => {
            setSelectedFolderIds(ids);
            setFolderOpen(false);
          }}
        />
      )}

      <View
        className="absolute inset-x-0 bottom-0"
        onLayout={(event) => setBottomHeight(event.nativeEvent.layout.height)}
      >
        <VotePrompt onPress={() => router.push("/diggle")} />

        <View className="flex-row gap-gutter border-t border-gray-200 bg-gray-0 px-margin pb-10 pt-3">
          <View className="flex-1">
            <Button variant="secondary" onPress={() => {}}>
              웹사이트 이동
            </Button>
          </View>
          <View className="flex-1">
            <FolderManageButton
              folderCount={selectedFolderIds.length}
              onPress={() => setFolderOpen(true)}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
