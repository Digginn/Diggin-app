import { StatusBar } from "expo-status-bar";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardCarousel, SwipeCarousel } from "@/components/carousel";

const PAGES = [
  {
    mainCopy: "이 쇼핑몰, 저 쇼핑몰\n분명 저장해뒀는데, 어디였더라?",
    subCopy: "쇼핑몰 찜부터 장바구니, 캡처까지.\n사고 싶은 것들이 여기저기 흩어져 있나요?",
    sampleClassName: "ml-1 bg-[#FF383C]",
    imageClassName: "",
    mainCopyClassName: "font-onboarding-title",
  },
  {
    mainCopy: "흩어진 취향을, Diggin.\n한곳에 모아보세요.",
    subCopy: "여러 쇼핑몰의 관심 아이템을 한곳에 모아\n편하게 다시 찾아보세요.",
    sampleClassName: "bg-[#FFCC00]",
    imageClassName: "left-px top-px",
    mainCopyClassName: "font-h2",
  },
  {
    mainCopy: "살까 말까,\n혼자 고민하지 마세요.",
    subCopy: "고민되는 아이템을 올리고\n다른 사람들의 선택을 확인해보세요.",
    sampleClassName: "bg-[#0088FF]",
    imageClassName: "",
    mainCopyClassName: "font-h2",
  },
] as const;

export function OnboardingScreen() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <>
      <StatusBar style="dark" />
      <ScrollView
        className="flex-1 bg-gray-0"
        contentContainerClassName="items-center"
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          minHeight: height,
          paddingTop: Math.max(insets.top, (height - 600) / 2 + 30),
          paddingBottom: insets.bottom,
        }}
      >
        <SwipeCarousel accessibilityLabel="서비스 소개">
          {PAGES.map((page) => (
            <CardCarousel
              key={page.mainCopy}
              mainCopy={page.mainCopy}
              subCopy={page.subCopy}
              mainCopyClassName={page.mainCopyClassName}
            >
              {/* 실제 소개 이미지가 정해지기 전까지 Figma의 Sample을 표시합니다. */}
              <View className={`h-[400px] items-center bg-[#D9D9D9] ${page.imageClassName}`}>
                <View className={`mt-[164px] size-20 ${page.sampleClassName}`} />
              </View>
            </CardCarousel>
          ))}
        </SwipeCarousel>
      </ScrollView>
    </>
  );
}
