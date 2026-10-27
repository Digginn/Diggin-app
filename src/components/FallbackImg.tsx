import { clsx } from "clsx";
import { Text, View } from "react-native";

import LogoSymbol from "@/assets/images/logo-symbol.svg";

type FallbackImgSize = "card" | "detail" | "field" | "vote";

type FallbackImgProps = {
  size?: FallbackImgSize;
  className?: string;
};

const SYMBOL_SIZE: Record<FallbackImgSize, number> = {
  card: 40,
  detail: 86,
  // 저장 시트의 92 박스 안에 들어가는 크기
  field: 34,
  // 투표 미리보기 80 칸. 시안이 없어 상품 카드(106 칸에 40)와 같은 비율로 둔다.
  vote: 30,
};

export function FallbackImg({ size = "card", className }: FallbackImgProps) {
  const symbolSize = SYMBOL_SIZE[size];

  return (
    <View
      className={clsx(
        "w-full items-center justify-center overflow-hidden bg-gray-100",
        size === "detail" && "h-[440px] gap-5 pt-[50px]",
        className,
      )}
    >
      <LogoSymbol width={symbolSize} height={symbolSize} />
      {size === "detail" && (
        <Text className="text-gray-500 font-label-16-medium">이미지를 불러올 수 없습니다.</Text>
      )}
    </View>
  );
}
