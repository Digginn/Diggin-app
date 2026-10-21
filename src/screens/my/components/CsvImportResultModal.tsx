import { FlatList, Pressable, Text, View, useWindowDimensions } from "react-native";
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
  const hasOnlyDuplicates = !isSuccess && failedCount === 0 && duplicateCount > 0;
  const isCompleted = isSuccess || hasOnlyDuplicates;
  const hasFolderLimitExceeded = result.folderFailures?.some(
    (failure) => failure.reason === "FOLDER_LIMIT_EXCEEDED",
  );
  const folderSaveFailureCount =
    result.folderFailures?.filter((failure) => failure.reason === "FOLDER_SAVE_FAILED").length ?? 0;

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
              제외된 아이템 {excluded.length}개
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="제외된 아이템 목록 닫기"
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
              ? `가져오지 못한 아이템 ${failedCount}개${duplicateCount > 0 ? `와 중복 아이템 ${duplicateCount}개` : ""}입니다.`
              : `중복 아이템 ${duplicateCount}개입니다.`}
          </Text>
          <FlatList
            data={excluded}
            keyExtractor={(product) => product.id}
            style={{
              height: Math.max(80, Math.min(363, height - insets.top - insets.bottom - 228)),
            }}
            renderItem={({ item: product }) => (
              <View className="gap-1 border-b border-gray-100 px-1 py-3">
                <Text numberOfLines={1} className="text-gray-900 font-b3">
                  {product.productName}
                </Text>
                <Text className="text-gray-500 font-meta">{product.reason}</Text>
              </View>
            )}
          />
          <Button onPress={onConfirm}>확인</Button>
        </>
      ) : (
        <>
          <View className="items-center gap-1">
            <View className={hasExcluded ? "h-12 justify-center" : ""}>
              <Text className="text-center text-gray-900 font-label-16-semibold">
                {isCompleted ? "아이템 가져오기가 완료되었습니다" : "아이템을 가져오지 못했습니다"}
              </Text>
            </View>
            <Text className="text-center text-gray-700 font-b3">
              {isSuccess ? (
                <>
                  총 <Text className="font-pretendard-bold">{result.importedCount}개</Text>의
                  아이템을 가져왔습니다.
                </>
              ) : hasOnlyDuplicates ? (
                "파일의 모든 아이템이 이미 저장되어 있습니다."
              ) : (
                "가져올 수 있는 아이템이 없습니다."
              )}
              {!isCompleted && (
                <>
                  {" "}
                  {"\n"}제외된 아이템{" "}
                  <Text className="font-pretendard-bold">{excluded.length}개</Text>를 확인해주세요.
                </>
              )}
              {isSuccess && failedCount > 0 && (
                <>
                  {"\n"}가져오지 못한 아이템{" "}
                  <Text className="font-pretendard-bold">{failedCount}개</Text>
                  {duplicateCount > 0 ? "와" : "는 제외했습니다."}
                </>
              )}
              {isSuccess && duplicateCount > 0 && (
                <>
                  {"\n"}중복 아이템 <Text className="font-pretendard-bold">{duplicateCount}개</Text>
                  는 제외했습니다.
                </>
              )}
            </Text>
          </View>
          <Text className="text-center text-gray-700 font-b3">
            {`전체 ${result.importedCount + excluded.length}개 · 성공 ${result.importedCount}개\n실패 ${failedCount}개 · 중복 ${duplicateCount}개`}
          </Text>
          {hasFolderLimitExceeded && (
            <Text className="text-center text-gray-600 font-b3">
              폴더 최대 개수를 초과한 아이템은 ALL탭에 개별 아이템으로 저장되었습니다.
            </Text>
          )}
          {folderSaveFailureCount > 0 && (
            <Text className="text-center text-gray-600 font-b3">
              {`폴더에 담지 못한 항목이 ${folderSaveFailureCount}건 있습니다.\n아이템은 ALL에서 확인할 수 있습니다.`}
            </Text>
          )}
          <View className="flex-row gap-modal-action">
            {hasExcluded && (
              <View className="flex-1">
                <Button variant="secondary" className="!px-2" onPress={onShowExcluded}>
                  제외된 아이템 보기
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
