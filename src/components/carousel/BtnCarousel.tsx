import { Pressable } from "react-native";

import ActiveDot from "@/assets/images/icon-carousel-active.svg";
import DefaultDot from "@/assets/images/icon-carousel-default.svg";

type BtnCarouselProps = {
  isActive: boolean;
  onPress: () => void;
  accessibilityLabel: string;
};

export function BtnCarousel({ isActive, onPress, accessibilityLabel }: BtnCarouselProps) {
  const Dot = isActive ? ActiveDot : DefaultDot;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isActive }}
      className="h-12 w-4 items-center justify-center"
    >
      <Dot />
    </Pressable>
  );
}
