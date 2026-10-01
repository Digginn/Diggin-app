import { clsx } from "clsx";
import { Image, type ImageSource } from "expo-image";
import { cssInterop } from "nativewind";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { FallbackImg } from "@/components/FallbackImg";

const StyledImage = cssInterop(Image, { className: "style" });

export const CARD_IMAGE_FRAME = "h-[106px] w-full rounded-lg bg-gray-100";

type CardProps = {
  name: string;
  price: number | string | null;
  thumbnailUrl?: string | null;
  thumbnailSource?: ImageSource | number;
  brand?: string | null;
  onPress?: () => void;
  className?: string;
};

export function Card({
  name,
  price,
  thumbnailUrl,
  thumbnailSource,
  brand,
  onPress,
  className,
}: CardProps) {
  const [failedSource, setFailedSource] = useState<ImageSource | number | string | null>();
  // null, undefined, 빈 문자열을 모두 "이미지 없음"으로 보도록 처리
  const suppliedSource = thumbnailSource ?? thumbnailUrl;
  const thumbnail = suppliedSource && suppliedSource !== failedSource ? suppliedSource : undefined;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? name : undefined}
      className={clsx("gap-2", onPress && "active:opacity-75", className)}
      disabled={!onPress}
      onPress={onPress}
    >
      {thumbnail ? (
        <StyledImage
          className={CARD_IMAGE_FRAME}
          contentFit="cover"
          onError={() => setFailedSource(thumbnail)}
          source={thumbnail}
        />
      ) : (
        <FallbackImg className={CARD_IMAGE_FRAME} />
      )}
      <View className="w-full gap-1.5">
        <View className="w-full gap-0.5">
          <View className="flex-row">
            <Text
              className="min-w-0 max-w-[94px] shrink text-gray-1000 font-price-s"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {price === null
                ? "가격 정보 없음"
                : typeof price === "number"
                  ? price.toLocaleString("ko-KR")
                  : price}
            </Text>
            {price !== null && (
              <Text className="shrink-0 text-gray-900 font-label-12-regular">원</Text>
            )}
          </View>
          <Text className="w-full text-gray-900 font-name-s" numberOfLines={1} ellipsizeMode="tail">
            {name}
          </Text>
        </View>
        {brand ? (
          <View className="w-full flex-row items-center">
            <Text
              className="min-w-0 flex-1 text-gray-500 font-brand-s"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {brand}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
