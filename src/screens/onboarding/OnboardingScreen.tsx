import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { CardCarousel, SwipeCarousel } from "@/components/carousel";
import { baseFrame } from "@/theme";

import { OnboardingIllustration } from "./components/OnboardingIllustration";

const AUTO_ADVANCE_DELAYS_MS = [2500, 2500] as const;

const PAGES = [
  {
    mainCopy: "이 쇼핑몰, 저 쇼핑몰\n분명 저장해뒀는데, 어디였더라?",
    subCopy: "쇼핑몰 찜부터 장바구니, 캡처까지.\n사고 싶은 것들이 여기저기 흩어져 있나요?",
  },
  {
    mainCopy: "흩어진 취향을, Diggin.\n한곳에 모아보세요.",
    subCopy: "여러 쇼핑몰의 위시 아이템을 한곳에 모아\n편하게 다시 찾아보세요.",
  },
  {
    mainCopy: "살까 말까,\n혼자 고민하지 마세요.",
    subCopy: "고민되는 아이템을 올리고\n다른 사람들의 선택을 확인해보세요.",
  },
] as const;

export function OnboardingScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const frameHeight = Math.max(height, baseFrame.height);

  return (
    <>
      <StatusBar style="dark" />
      <ScrollView
        className="flex-1 bg-gray-0"
        contentContainerClassName="items-center"
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          minHeight: frameHeight,
          paddingTop: Math.max(insets.top + 41, (frameHeight - baseFrame.height) / 2 + 100),
          paddingBottom: Math.max(insets.bottom + 10, 44),
        }}
      >
        <SwipeCarousel
          accessibilityLabel="서비스 소개"
          onPageChange={setActiveIndex}
          autoAdvanceDelays={AUTO_ADVANCE_DELAYS_MS}
          media={<OnboardingIllustration page={activeIndex} />}
        >
          {PAGES.map((page) => (
            <CardCarousel key={page.mainCopy} mainCopy={page.mainCopy} subCopy={page.subCopy} />
          ))}
        </SwipeCarousel>
        {activeIndex === PAGES.length - 1 && (
          <View className="w-[295px] pt-9">
            <Button onPress={() => router.replace("/login")}>시작하기</Button>
          </View>
        )}
      </ScrollView>
    </>
  );
}
