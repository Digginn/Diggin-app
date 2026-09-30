import { Image } from "expo-image";
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
import { WishLevel } from "@/components/WishLevel";
import type { WishLevelCounts } from "@/types/wish-item";

import { EditChip } from "./components/EditChip";
import { ItemEditSheet } from "./components/ItemEditSheet";
import { ItemInfo } from "./components/ItemInfo";
import { VotePrompt } from "./components/VotePrompt";

const StyledImage = cssInterop(Image, { className: "style" });
const ShareIcon = cssInterop(ShareSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

const HERO_FRAME = "h-[440px] w-full bg-gray-800";

// TODO: API 연결 전까지 쓰는 임시 데이터.
const MOCK_ITEM = {
  name: "Real Good Pants 엄청 좋은 바지",
  price: 70000,
  brand: "브랜드명",
  sourceUrl: "http://pf.kakao.com/_zIxnrX",
  thumbnailUrl: null as string | null,
};

const MOCK_LEVELS: WishLevelCounts = { high: 0, medium: 0, low: 0 };

export function ItemDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // TODO: API 연결 시 이 id 로 아이템을 조회한다.
  useLocalSearchParams<{ id: string }>();

  const [failed, setFailed] = useState(false);
  const [isEditOpen, setEditOpen] = useState(false);
  const [bottomHeight, setBottomHeight] = useState(0);

  const item = MOCK_ITEM;
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

          <View className="absolute left-0 top-0" style={{ paddingTop: insets.top }}>
            <AppBar.IconButton
              icon={IconBack}
              accessibilityLabel="뒤로 가기"
              onPress={() => router.back()}
            />
          </View>

          <View className="absolute bottom-3 left-4 h-12 justify-center">
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

        <View className="gap-[13px] px-4 pt-4">
          <View className="w-full flex-row items-center justify-between">
            <Text className="text-gray-1000 font-label-14">{item.brand}</Text>
            <EditChip onPress={() => setEditOpen(true)} />
          </View>
          <ItemInfo name={item.name} price={item.price} sourceUrl={item.sourceUrl} />
        </View>
      </ScrollView>

      <ItemEditSheet
        visible={isEditOpen}
        initialValues={{
          name: item.name,
          price: String(item.price),
          sourceUrl: item.sourceUrl,
        }}
        thumbnailUrl={item.thumbnailUrl}
        wishLevelLabel={null}
        onRequestClose={() => setEditOpen(false)}
        onOpenWishLevel={() => {}}
        onOpenTooltip={() => {}}
        onPickImage={() => {}}
        onSubmit={() => setEditOpen(false)}
      />

      <View
        className="absolute inset-x-0 bottom-0"
        onLayout={(event) => setBottomHeight(event.nativeEvent.layout.height)}
      >
        <VotePrompt onPress={() => router.push("/diggle")} />

        <View className="flex-row justify-between border-t border-gray-200 bg-gray-0 px-margin pb-10 pt-3">
          <Button variant="secondary" className="w-[155px]" onPress={() => {}}>
            웹사이트 이동
          </Button>
          <Button variant="primary" className="w-[155px]" onPress={() => {}}>
            폴더에 추가
          </Button>
        </View>
      </View>
    </View>
  );
}
