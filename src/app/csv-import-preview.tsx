import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { CsvImportLoading } from "@/screens/my/components/CsvImportLoading";
import { CsvImportScreen } from "@/screens/my/CsvImportScreen";
import type { CsvExcludedProduct, CsvImportResult } from "@/screens/my/types/csvImport";

// UI 확인용 Figma 예시입니다. 실제 파일을 파싱하거나 상품을 저장하지 않습니다.
const EXCLUDED: CsvExcludedProduct[] = [
  ["린넨 오버핏 셔츠 베이지", "상품 정보를 확인할 수 없습니다."],
  ["데일리 캔버스 토트백", "상품 정보를 확인할 수 없습니다."],
  ["와이드 데님 팬츠 연청", "상품 링크가 올바르지 않습니다."],
  ["미니 크로스백 블랙", "상품 링크가 올바르지 않습니다."],
  ["니트 가디건 아이보리", "지원하지 않는 쇼핑몰입니다."],
  ["레더 로퍼 브라운", "지원하지 않는 쇼핑몰입니다."],
  ["스트라이프 긴팔 티셔츠", "필수 상품 정보가 누락되었습니다."],
  ["울 블렌드 머플러", "필수 상품 정보가 누락되었습니다."],
  ["코튼 볼캡 네이비", "이미 저장된 상품입니다."],
  ["실버 체인 목걸이", "이미 저장된 상품입니다."],
  ["캐시미어 니트 그레이", "이미 저장된 상품입니다."],
].map(([productName, reason], index) => ({
  id: String(index),
  productName,
  reason,
  kind: index < 8 ? "failed" : "duplicate",
}));

const SCENARIOS: { label: string; result: CsvImportResult }[] = [
  { label: "일부 제외 (42개 성공)", result: { importedCount: 42, excludedProducts: EXCLUDED } },
  {
    label: "중복만 제외 (50개 성공)",
    result: { importedCount: 50, excludedProducts: EXCLUDED.slice(8) },
  },
  { label: "전체 성공 (53개)", result: { importedCount: 53, excludedProducts: [] } },
  { label: "전체 실패 (11개 제외)", result: { importedCount: 0, excludedProducts: EXCLUDED } },
];

export default function CsvImportPreview() {
  const [scenario, setScenario] = useState<
    number | "intro" | "loading" | "animation" | "error" | null
  >(null);
  if (scenario === "intro") return <CsvImportScreen onBack={() => setScenario(null)} />;
  if (scenario === "error")
    return <CsvImportScreen error="missing-product-info" onBack={() => setScenario(null)} />;
  if (scenario === "animation")
    return (
      <View className="flex-1 bg-gray-1000">
        <StatusBar style="light" />
        <AppBar title="불러오기" colorScheme="dark" onBack={() => setScenario(null)} />
        <CsvImportLoading />
      </View>
    );
  if (scenario === "loading")
    return (
      <CsvImportScreen progress={{ completed: 12, total: 48 }} onBack={() => setScenario(null)} />
    );
  if (scenario !== null)
    return (
      <CsvImportScreen
        result={SCENARIOS[scenario].result}
        onDismissResult={() => setScenario(null)}
      />
    );
  return (
    <View className="flex-1 bg-gray-0">
      <AppBar title="CSV UI 미리보기" />
      <ScrollView contentContainerClassName="gap-4 px-margin py-6">
        <Text className="text-gray-600 font-b3">
          디자인 예시 데이터이며 실제 상품은 등록되지 않습니다.
        </Text>
        <Button onPress={() => setScenario("intro")}>CSV 소개 애니메이션</Button>
        <Button onPress={() => setScenario("loading")}>불러오는 중 (12 / 48)</Button>
        <Button onPress={() => setScenario("animation")}>진행 개수 수신 전 애니메이션</Button>
        {SCENARIOS.map(({ label }, index) => (
          <Button key={label} onPress={() => setScenario(index)}>
            {label}
          </Button>
        ))}
        <Button onPress={() => setScenario("error")}>상품 정보 없음 (에러 토스트)</Button>
      </ScrollView>
    </View>
  );
}
