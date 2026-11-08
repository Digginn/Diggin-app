import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

type CarouselCopyProps = {
  mainCopy: string;
  subCopy: string;
  children?: ReactNode;
  mainCopyClassName?: string;
};

export function EmptyCarousel({
  mainCopy,
  subCopy,
  children,
  mainCopyClassName = "font-h2",
}: CarouselCopyProps) {
  return (
    <View className="w-[296px] gap-8">
      <View className="h-[396px]" accessible={false}>
        {children}
      </View>
      <View className="gap-3">
        <Text
          className={clsx("text-center text-gray-900", mainCopyClassName)}
          style={{ includeFontPadding: false }}
        >
          {mainCopy}
        </Text>
        <Text className="text-center text-gray-500 font-b2" style={{ includeFontPadding: false }}>
          {subCopy}
        </Text>
      </View>
    </View>
  );
}

export function CardCarousel(props: CarouselCopyProps) {
  return (
    <View className="h-[600px] w-[296px] overflow-hidden">
      <EmptyCarousel {...props} />
    </View>
  );
}
