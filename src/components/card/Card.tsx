import { clsx } from "clsx";
import { Image, type ImageSource } from "expo-image";
import { cssInterop } from "nativewind";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import OwnedBadgeIcon from "@/assets/images/icon-basket-check-white.svg";
import SelectCheckOnSvg from "@/assets/images/icon-select-check-on.svg";
import { FallbackImg } from "@/components/FallbackImg";

const StyledImage = cssInterop(Image, { className: "style" });

export const CARD_IMAGE_FRAME = "h-[106px] w-full rounded-lg bg-gray-100";

/** none: 일반 목록, unselected/selected: 선택 모드 */
export type CardSelectState = "none" | "unselected" | "selected";

const CHECK_ICON_SIZE = 20;

type CardProps = {
  name: string;
  price: number | string | null;
  thumbnailUrl?: string | null;
  thumbnailSource?: ImageSource | number;
  brand?: string | null;
  isOwned?: boolean;
  onPress?: () => void;
  select?: CardSelectState;
  className?: string;
};

export function Card({
  name,
  price,
  thumbnailUrl,
  thumbnailSource,
  brand,
  isOwned = false,
  onPress,
  select = "none",
  className,
}: CardProps) {
  const [failedSource, setFailedSource] = useState<ImageSource | number | string | null>();
  // null, undefined, 빈 문자열을 모두 "이미지 없음"으로 보도록 처리
  const suppliedSource = thumbnailSource ?? thumbnailUrl;
  const thumbnail = suppliedSource && suppliedSource !== failedSource ? suppliedSource : undefined;
  const isSelectMode = select !== "none";
  const isSelected = select === "selected";

  return (
    <Pressable
      accessibilityRole={isSelectMode ? "checkbox" : onPress ? "button" : undefined}
      accessibilityState={isSelectMode ? { checked: isSelected } : undefined}
      accessibilityLabel={isOwned ? `${name}, 나의 소장템` : onPress ? name : undefined}
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
      {isOwned && (
        <View
          pointerEvents="none"
          className="absolute inset-x-0 top-0 h-[106px] rounded-lg bg-gray-0/40"
        >
          <View className="absolute left-1.5 top-1.5 size-6 items-center justify-center rounded-full bg-gray-900 shadow-sm">
            <View className="size-4 items-center justify-center">
              <OwnedBadgeIcon width={12} height={12} />
            </View>
          </View>
        </View>
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
        <View className="h-3 w-full flex-row items-center">
          {brand ? (
            <Text
              className="min-w-0 flex-1 text-gray-500 font-brand-s"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {brand}
            </Text>
          ) : null}
        </View>
      </View>

      {isSelected ? (
        <>
          <View className="absolute inset-x-0 top-0 h-[106px] rounded-lg bg-gray-1000/15" />
          <View className="absolute right-1.5 top-1.5 size-6 items-center justify-center">
            <SelectCheckOnSvg width={CHECK_ICON_SIZE} height={CHECK_ICON_SIZE} />
          </View>
        </>
      ) : null}
    </Pressable>
  );
}
