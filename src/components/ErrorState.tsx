import { useRef, useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";

import { Button } from "@/components/Button";

type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const area = useRef<View>(null);
  const { height } = useWindowDimensions();
  const [offset, setOffset] = useState(0);

  return (
    // BUG-075 남은 영역이 아니라 기기 화면 전체 기준 정중앙에 둔다. 영역의 위치를 재서 그만큼 옮긴다.
    <View
      ref={area}
      className="flex-1"
      onLayout={() =>
        area.current?.measureInWindow((_x, y, _width, areaHeight) =>
          setOffset(height / 2 - (y + areaHeight / 2)),
        )
      }
    >
      <View
        // 화면 중앙 정렬로 위에 겹친 빈 영역은 터치를 통과시키고 재시도 버튼만 받는다.
        pointerEvents="box-none"
        className="flex-1 items-center justify-center gap-6 px-margin"
        style={{ transform: [{ translateY: offset }] }}
      >
        <Text className="text-center text-gray-500 font-b1">{message}</Text>
        {/* Button은 self-stretch라 폭만 주면 왼쪽에 붙는다. 156 틀 안에 넣어 가운데에 둔다. */}
        <View className="w-[156px]">
          <Button onPress={() => onRetry?.()} isDisabled={!onRetry}>
            다시 시도
          </Button>
        </View>
      </View>
    </View>
  );
}
