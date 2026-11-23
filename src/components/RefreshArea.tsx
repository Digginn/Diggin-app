import type { ReactNode } from "react";
import { Platform, View } from "react-native";

import { Spinner } from "@/components/Loading";

/** iOS 기본 새로고침 표시는 모양을 바꿀 수 없어 숨긴다. RefreshControl의 tintColor에 넣는다(BUG-131). */
export const REFRESH_TINT = Platform.OS === "ios" ? "transparent" : undefined;

/**
 * 당겨서 새로고침 목록을 감싸고, iOS는 새로고침 중 공통 Loading/Spinner를 대신 그린다.
 * isRefreshing은 직접 당긴 새로고침에만 켠다. 다른 화면 동작으로 다시 불러올 때 켜면 멈춘 스피너처럼 보인다.
 */
export function RefreshArea({
  isRefreshing,
  children,
}: {
  isRefreshing: boolean;
  children: ReactNode;
}) {
  return (
    <View className="flex-1">
      {children}
      {isRefreshing && Platform.OS === "ios" ? (
        // iOS 새로고침 영역(약 60) 가운데에 맞춘다.
        <View pointerEvents="none" className="absolute inset-x-0 top-[14px] items-center">
          <Spinner />
        </View>
      ) : null}
    </View>
  );
}
