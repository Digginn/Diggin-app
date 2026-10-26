import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ScrollView, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { BtnCarousel } from "./BtnCarousel";

type SwipeCarouselProps = {
  children: ReactNode;
  accessibilityLabel?: string;
  onPageChange?: (index: number) => void;
  autoAdvanceDelays?: readonly number[];
};

const CARD_WIDTH = 296;

export function SwipeCarousel({
  children,
  accessibilityLabel = "캐러셀",
  onPageChange,
  autoAdvanceDelays,
}: SwipeCarouselProps) {
  const pages = Children.toArray(children).filter(isValidElement);
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const isReducedMotion = useReducedMotion();

  const updatePage = useCallback(
    (index: number) => {
      setActiveIndex(index);
      onPageChange?.(index);
    },
    [onPageChange],
  );

  const goToPage = useCallback(
    (index: number) => {
      const nextIndex = Math.max(0, Math.min(pages.length - 1, index));
      scrollRef.current?.scrollTo({ x: nextIndex * CARD_WIDTH, animated: !isReducedMotion });
    },
    [pages.length, isReducedMotion],
  );

  function updateFromOffset(offset: number) {
    const index = Math.max(0, Math.min(pages.length - 1, Math.round(offset / CARD_WIDTH)));
    if (index !== activeIndex) updatePage(index);
  }

  useEffect(() => {
    const delay = autoAdvanceDelays?.[activeIndex];
    if (delay === undefined || activeIndex >= pages.length - 1 || isScrolling || isReducedMotion) {
      return;
    }

    const timer = setTimeout(() => goToPage(activeIndex + 1), delay);
    return () => clearTimeout(timer);
  }, [activeIndex, autoAdvanceDelays, goToPage, isScrolling, isReducedMotion, pages.length]);

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
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => updateFromOffset(nativeEvent.contentOffset.x)}
        onLayout={() =>
          scrollRef.current?.scrollTo({ x: activeIndex * CARD_WIDTH, animated: false })
        }
        onScrollBeginDrag={() => setIsScrolling(true)}
        onScrollEndDrag={() => setIsScrolling(false)}
        onMomentumScrollBegin={() => setIsScrolling(true)}
        onMomentumScrollEnd={({ nativeEvent }) => {
          setIsScrolling(false);
          updateFromOffset(nativeEvent.contentOffset.x);
        }}
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
      <View className="absolute inset-x-0 top-[561px] h-12 flex-row justify-center pl-px">
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
