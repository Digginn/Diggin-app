import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconCsvClose } from "@/assets/images/my/csv";
import { Button } from "@/components/Button";
import { Modal } from "@/components/modal";

import type { CsvImportResult } from "../types/csvImport";

type CsvImportResultModalProps = {
  result: CsvImportResult | null;
  isExcludedListOpen: boolean;
  onShowExcluded: () => void;
  onCloseExcluded: () => void;
  onConfirm: () => void;
};

export function CsvImportResultModal({
  result,
  isExcludedListOpen,
  onShowExcluded,
  onCloseExcluded,
  onConfirm,
}: CsvImportResultModalProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!result) return null;
  const excluded = result.excludedProducts;
  const failedCount = excluded.filter((product) => product.kind === "failed").length;
  const duplicateCount = excluded.length - failedCount;
  const hasExcluded = excluded.length > 0;
  const isSuccess = result.importedCount > 0;

  return (
    <Modal
      visible
      onRequestClose={isExcludedListOpen ? onCloseExcluded : onConfirm}
      scrimOpacity={0.36}
      className={isExcludedListOpen || hasExcluded ? "px-4 pb-4 pt-2" : "px-4 pb-4 pt-5"}
      contentClassName={`w-full ${isExcludedListOpen ? "gap-4" : "gap-[25px]"}`}
    >
      {isExcludedListOpen ? (
        <>
          <View className="flex-row items-center">
            <View className="size-12" />
            <Text className="flex-1 text-center text-gray-900 font-label-16-semibold">
              제외된 상품 {excluded.length}개
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="제외된 상품 목록 닫기"
              className="size-12 items-center justify-center"
              onPress={onCloseExcluded}
            >
              <View className="size-4 items-center justify-center">
                <IconCsvClose />
              </View>
            </Pressable>
          </View>
          <Text className="text-center text-gray-600 font-b3">
            {failedCount > 0
              ? `가져오지 못한 상품 ${failedCount}개${duplicateCount > 0 ? `와 중복 상품 ${duplicateCount}개` : ""}입니다.`
              : `중복 상품 ${duplicateCount}개입니다.`}
          </Text>
          <ScrollView
            style={{
              height: Math.max(80, Math.min(363, height - insets.top - insets.bottom - 228)),
            }}
          >
            {excluded.map((product) => (
              <View key={product.id} className="gap-1 border-b border-gray-100 px-1 py-3">
                <Text numberOfLines={1} className="text-gray-900 font-b3">
                  {product.productName}
                </Text>
                <Text className="text-gray-500 font-meta">{product.reason}</Text>
              </View>
            ))}
          </ScrollView>
          <Button onPress={onConfirm}>확인</Button>
        </>
      ) : (
        <>
          <View className="items-center gap-1">
            <View className={hasExcluded ? "h-12 justify-center" : ""}>
              <Text className="text-center text-gray-900 font-label-16-semibold">
                {isSuccess ? "상품 가져오기가 완료되었습니다" : "상품을 가져오지 못했습니다"}
              </Text>
            </View>
            <Text className="text-center text-gray-700 font-b3">
              {isSuccess ? (
                <>
                  총 <Text className="font-pretendard-bold">{result.importedCount}개</Text>의 상품을
                  가져왔습니다.
                </>
              ) : (
                "가져올 수 있는 상품이 없습니다."
              )}
              {!isSuccess && (
                <>
                  {" "}
                  {"\n"}제외된 상품{" "}
                  <Text className="font-pretendard-bold">{excluded.length}개</Text>를 확인해주세요.
                </>
              )}
              {isSuccess && failedCount > 0 && (
                <>
                  {"\n"}가져오지 못한 상품{" "}
                  <Text className="font-pretendard-bold">{failedCount}개</Text>
                  {duplicateCount > 0 ? "와" : "는 제외했습니다."}
                </>
              )}
              {isSuccess && duplicateCount > 0 && (
                <>
                  {"\n"}중복 상품 <Text className="font-pretendard-bold">{duplicateCount}개</Text>는
                  제외했습니다.
                </>
              )}
            </Text>
          </View>
          <View className="flex-row gap-[15px]">
            {hasExcluded && (
              <View className="flex-1">
                <Button variant="secondary" className="!px-2" onPress={onShowExcluded}>
                  제외된 상품 보기
                </Button>
              </View>
            )}
            <View className="flex-1">
              <Button onPress={onConfirm}>확인</Button>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
