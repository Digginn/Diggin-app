import { clsx } from "clsx";
import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { FallbackImg } from "@/components/FallbackImg";

const StyledImage = cssInterop(Image, { className: "style" });

type CardProps = {
  name: string;
  price: number;
  thumbnailUrl?: string | null;
  brand?: string | null;
  onPress?: () => void;
  className?: string;
};

export function Card({ name, price, thumbnailUrl, brand, onPress, className }: CardProps) {
  const [failedUrl, setFailedUrl] = useState<string>();
  // null, undefined, 빈 문자열을 모두 "이미지 없음"으로 보도록 처리
  const thumbnail = thumbnailUrl && thumbnailUrl !== failedUrl ? thumbnailUrl : undefined;

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
          className="h-[106px] w-full rounded-lg bg-gray-100"
          contentFit="cover"
          onError={() => setFailedUrl(thumbnail)}
          source={thumbnail}
        />
      ) : (
        <FallbackImg size="card" />
      )}
      <View className="w-full gap-1.5">
        <View className="w-full gap-0.5">
          <View className="flex-row">
            <Text className="max-w-[94px] text-gray-1000 font-price-s" numberOfLines={1}>
              {price.toLocaleString("ko-KR")}
            </Text>
            <Text className="text-gray-900 font-label-12-regular">원</Text>
          </View>
          <Text className="w-full text-gray-900 font-name-s" numberOfLines={1}>
            {name}
          </Text>
        </View>
        {brand ? (
          <View className="w-full flex-row items-center">
            <Text className="flex-1 text-gray-500 font-brand-s" numberOfLines={1}>
              {brand}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
