import * as DocumentPicker from "expo-document-picker";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Alert, BackHandler, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { useToast } from "@/hooks/useToast";
import { colors } from "@/theme";

import { CsvImportIllustration } from "./components/CsvImportIllustration";
import { CsvImportLoading } from "./components/CsvImportLoading";
import { CsvImportResultModal } from "./components/CsvImportResultModal";
import type { CsvImportFailure, CsvImportProgress, CsvImportResult } from "./types/csvImport";

const MISSING_PRODUCT_MESSAGE = "파일에서 아이템 정보를 찾을 수 없습니다.";
// Figma: 화면 812 - 버튼 top 720 - 버튼 높이 48.
const MIN_BUTTON_BOTTOM_SPACING = 44;

type CsvImportScreenProps = {
  onSelectCsv?: (
    file: DocumentPicker.DocumentPickerAsset,
    onProgress: (progress: CsvImportProgress) => void,
  ) => void | Promise<CsvImportResult | CsvImportFailure | void>;
  progress?: CsvImportProgress;
  result?: CsvImportResult;
  error?: CsvImportFailure["error"];
  onDismissResult?: () => void;
  onBack?: () => void;
};

export function CsvImportScreen({
  onSelectCsv,
  progress: suppliedProgress,
  result: suppliedResult,
  error,
  onDismissResult,
  onBack,
}: CsvImportScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const showToast = useToast();
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const [isSelecting, setIsSelecting] = useState(false);
  const isSelectingRef = useRef(false);
  const isMounted = useRef(true);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<CsvImportProgress>();
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [isExcludedListOpen, setIsExcludedListOpen] = useState(false);
  const activeResult = suppliedResult ?? result;
  const isLoading = isImporting || suppliedProgress !== undefined;
  const handleLoadingBack = () =>
    Alert.alert("불러오는 중", "불러오기가 완료될 때까지 기다려 주세요.");

  useEffect(() => {
    if (error) showToast(MISSING_PRODUCT_MESSAGE, "error");
  }, [error, showToast]);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!isLoading) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      (onBack ?? handleLoadingBack)();
      return true;
    });
    return () => subscription.remove();
  }, [isLoading, onBack]);

  const handleConfirm = () => {
    setResult(null);
    setIsExcludedListOpen(false);
    onDismissResult?.();
  };

  const handleSelectCsv = async () => {
    if (isSelectingRef.current) return;
    isSelectingRef.current = true;
    setIsSelecting(true);
    try {
      // 내보내기 앱마다 CSV MIME이 달라 확장자로 검증합니다.
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !isMounted.current) return;
      const file = result.assets[0];
      if (!file || !/\.csv$/i.test(file.name)) {
        Alert.alert("파일 형식 확인", "CSV 파일을 선택해 주세요.");
        return;
      }
      if (onSelectCsv) {
        setProgress(undefined);
        setIsImporting(true);
        const imported = await onSelectCsv(file, (value) => {
          if (isMounted.current) setProgress(value);
        });
        if (isMounted.current && imported && typeof imported === "object") {
          if ("error" in imported) showToast(MISSING_PRODUCT_MESSAGE, "error");
          else setResult(imported);
        }
      } else {
        Alert.alert(
          "CSV 파일 선택",
          `${file.name}\n아이템 불러오기 API는 아직 연결되지 않았습니다.`,
        );
      }
    } catch {
      if (isMounted.current)
        Alert.alert("파일 불러오기 실패", "파일을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      isSelectingRef.current = false;
      if (isMounted.current) {
        setIsSelecting(false);
        setIsImporting(false);
      }
    }
  };

  return (
    <View
      className="flex-1 bg-gray-1000"
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setSize({ width, height });
      }}
    >
      <StatusBar style="light" />
      {!isLoading && (
        <CsvImportIllustration
          width={size.width}
          height={size.height}
          hasResult={activeResult !== null}
        />
      )}
      <AppBar
        title="불러오기"
        colorScheme="dark"
        onBack={onBack ?? (isLoading ? handleLoadingBack : undefined)}
      />
      {isLoading ? (
        <>
          <View className="flex-1" />
          <CsvImportLoading progress={suppliedProgress ?? progress} />
        </>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerClassName={`items-center px-margin ${activeResult ? "pt-[65px]" : "pt-10"}`}
          >
            <View className="items-center gap-6">
              <Text className="text-center text-gray-0 font-h1">
                {"모아둔 취향,\nDiggin에서 이어갑니다"}
              </Text>
              <Text className="text-center text-gray-400 font-label-16-medium">
                {
                  "다른 앱에서 내려받은 위시 아이템\nCSV 파일이 있다면 Diggin으로\n한 번에 불러올 수 있습니다."
                }
              </Text>
            </View>
          </ScrollView>
          <View
            className="px-margin pt-4"
            style={{ paddingBottom: Math.max(MIN_BUTTON_BOTTOM_SPACING, insets.bottom + 10) }}
          >
            <Button
              variant="secondary"
              size="large"
              bgColor={colors.gray[0]}
              isDisabled={isSelecting}
              onPress={handleSelectCsv}
            >
              CSV 파일로 데이터 불러오기
            </Button>
          </View>
        </>
      )}
      <CsvImportResultModal
        result={activeResult}
        isExcludedListOpen={isExcludedListOpen}
        onShowExcluded={() => setIsExcludedListOpen(true)}
        onCloseExcluded={() => setIsExcludedListOpen(false)}
        onConfirm={handleConfirm}
      />
    </View>
  );
}
