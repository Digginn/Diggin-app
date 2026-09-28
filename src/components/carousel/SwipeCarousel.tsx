import { Children, isValidElement, useRef, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { BtnCarousel } from "./BtnCarousel";

type SwipeCarouselProps = {
  children: ReactNode;
  accessibilityLabel?: string;
};

const CARD_WIDTH = 296;

export function SwipeCarousel({ children, accessibilityLabel = "캐러셀" }: SwipeCarouselProps) {
  const pages = Children.toArray(children).filter(isValidElement);
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function goToPage(index: number) {
    const nextIndex = Math.max(0, Math.min(pages.length - 1, index));
    scrollRef.current?.scrollTo({ x: nextIndex * CARD_WIDTH, animated: true });
    setActiveIndex(nextIndex);
  }

  if (pages.length === 0) return null;

  return (
    <View className="h-[600px] w-[295px]">
      <ScrollView
        ref={scrollRef}
        horizontal
        snapToOffsets={pages.map((_, index) => index * CARD_WIDTH)}
        snapToEnd={false}
        decelerationRate="fast"
        disableIntervalMomentum
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onLayout={() =>
          scrollRef.current?.scrollTo({ x: activeIndex * CARD_WIDTH, animated: false })
        }
        onMomentumScrollEnd={({ nativeEvent }) =>
          setActiveIndex(
            Math.max(
              0,
              Math.min(pages.length - 1, Math.round(nativeEvent.contentOffset.x / CARD_WIDTH)),
            ),
          )
        }
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 1, max: pages.length, now: activeIndex + 1 }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "increment") goToPage(activeIndex + 1);
          if (nativeEvent.actionName === "decrement") goToPage(activeIndex - 1);
        }}
      >
        {pages.map((page) => (
          <View key={page.key} className="h-[600px] w-[296px]">
            {page}
          </View>
        ))}
      </ScrollView>
      <View className="absolute inset-x-0 top-[544px] h-12 flex-row justify-center pl-px">
        {pages.map((page, index) => (
          <BtnCarousel
            key={page.key}
            isActive={index === activeIndex}
            onPress={() => goToPage(index)}
            accessibilityLabel={`${accessibilityLabel} ${index + 1}페이지`}
          />
        ))}
      </View>
    </View>
  );
}
