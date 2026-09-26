import { useState } from "react";
import { View } from "react-native";

import { Tooltip } from "@/components/Tooltip";

const longTooltipMessage = "툴팁설명".repeat(10);

export default function Index() {
  const [isTopTooltipVisible, setIsTopTooltipVisible] = useState(true);
  const [isLeftTooltipVisible, setIsLeftTooltipVisible] = useState(true);
  const [isLongTooltipVisible, setIsLongTooltipVisible] = useState(true);

  return (
    <View className="flex-1 items-center justify-center bg-gray-0">
      <View className="w-[237px] gap-10 px-5 py-5">
        {isTopTooltipVisible && (
          <Tooltip message="툴팁 이름" onClose={() => setIsTopTooltipVisible(false)} />
        )}
        {isLeftTooltipVisible && (
          <Tooltip
            arrowPosition="left"
            message="툴팁 설명"
            onClose={() => setIsLeftTooltipVisible(false)}
          />
        )}
        {isLongTooltipVisible && (
          <Tooltip message={longTooltipMessage} onClose={() => setIsLongTooltipVisible(false)} />
        )}
      </View>
    </View>
  );
}
