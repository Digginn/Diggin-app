import { useLocalSearchParams, useRouter } from "expo-router";

import { FolderDetailScreen, type FolderDetailItem } from "@/screens/folder/FolderDetailScreen";

// Figma 시안 비교용 데이터이며 실제 폴더 조회 결과는 아닙니다.
const PREVIEW_ITEMS: FolderDetailItem[] = Array.from({ length: 12 }, (_, index) => ({
  id: `preview-${index}`,
  name: index === 0 ? "Real Good Pants 엄청 좋은 바지" : "아이템명",
  brand: "브랜드명",
  price: index === 3 ? null : index === 5 ? 0 : "000,000",
  thumbnailSource: require("@/assets/images/folder/image-item-preview.png"),
}));
const LONG_PREVIEW_ITEMS: FolderDetailItem[] = PREVIEW_ITEMS.map((item) => ({
  ...item,
  name: "[단독/리미티드] 오버핏 울 캐시미어 블렌드 싱글 브레스티드 롱 코트 - 멜란지 그레이 (남녀공용 FREE)",
  brand: "Maison Lune Atelier Seoul Studio",
  price: 1234567890,
}));

export default function FolderDetailRoute() {
  const { name, preview } = useLocalSearchParams<{ name?: string; preview?: string }>();
  const router = useRouter();
  const isError = __DEV__ && preview === "error";
  const isLongPreview = __DEV__ && preview === "long";
  return (
    <FolderDetailScreen
      folderName={name ?? (isLongPreview ? "가을겨울아우터" : "폴더명")}
      items={__DEV__ ? (isLongPreview ? LONG_PREVIEW_ITEMS : PREVIEW_ITEMS) : []}
      savedItemCount={isLongPreview ? 1234 : undefined}
      isError={isError}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/folder"))}
      onRetry={isError ? () => router.setParams({ preview: undefined }) : undefined}
    />
  );
}
