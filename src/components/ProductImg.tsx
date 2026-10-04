import { clsx } from "clsx";
import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { useState } from "react";
import { Pressable, View } from "react-native";

import MiniCloseSvg from "@/assets/images/icon-mini-close.svg";
import InfoSvg from "@/assets/images/icon-product-info.svg";
import { FallbackImg } from "@/components/FallbackImg";

const StyledImage = cssInterop(Image, { className: "style" });
const InfoIcon = cssInterop(InfoSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});
const MiniCloseIcon = cssInterop(MiniCloseSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

const FRAME = "size-full rounded-lg bg-gray-100";

type ProductImgProps = {
  url?: string | null;
  onPressInfo?: () => void;
  /** 넘기면 i 대신 첨부 제거 버튼이 나옴 */
  onRemove?: () => void;
  className?: string;
};

export function ProductImg({ url, onPressInfo, onRemove, className }: ProductImgProps) {
  const [isFailed, setIsFailed] = useState(false);
  const source = url && !isFailed ? url : undefined;

  return (
    <View className={clsx("aspect-square", className)}>
      {source ? (
        <StyledImage
          className={FRAME}
          contentFit="cover"
          onError={() => setIsFailed(true)}
          source={source}
        />
      ) : (
        <FallbackImg className={FRAME} />
      )}
      {onRemove ? (
        <Pressable
          accessibilityLabel="첨부 제거"
          accessibilityRole="button"
          className="absolute right-0 top-0 size-12 items-center justify-center p-2.5 active:opacity-75"
          onPress={onRemove}
        >
          <MiniCloseIcon className="size-6" />
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel="아이템 정보 보기"
          accessibilityRole="button"
          className="absolute right-0 top-0 size-12 items-center justify-center active:opacity-75"
          onPress={onPressInfo}
        >
          <InfoIcon className="size-5" />
        </Pressable>
      )}
    </View>
  );
}
