import { useRef, useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";

import { Chip } from "@/components/Chip";
import { colors } from "@/theme";

type Levels = { high: number; medium: number; low: number };

type ChipLayout = { x: number; y: number; height: number };

type WishLevelProps = {
  levels: Levels;
  label?: string;
};

const LEVEL_CONFIG = [
  { key: "high" as const, label: "높음", dotClassName: "bg-gray-600" },
  { key: "medium" as const, label: "중간", dotClassName: "bg-gray-500" },
  { key: "low" as const, label: "낮음", dotClassName: "bg-gray-400" },
];

function LevelItem({
  label,
  dotClassName,
  count,
}: {
  label: string;
  dotClassName: string;
  count: number;
}) {
  return (
    <View
      className="flex-row items-center rounded-full border border-gray-200 bg-gray-0 px-3 py-2"

      style={{
        shadowColor: colors.gray[1000],
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 20,
        shadowOpacity: 0.1,
        elevation: 4,
      }}
    >
      <View className="flex-row items-center gap-2">
        <View className={`size-2 rounded-full ${dotClassName}`} />
        <View className="flex-row items-center gap-1">
          <Text className="text-gray-900 font-b3">{label}</Text>
          <Text className="text-gray-900 font-label-14">
            {count >= 999 ? "999+" : String(count)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function LevelList({ levels, onLayout }: { levels: Levels; onLayout: (height: number) => void }) {
  return (
    <View
      className="items-start gap-2 py-2.5"
      onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
    >
      {LEVEL_CONFIG.map(({ key, label, dotClassName }) => (
        <LevelItem key={key} label={label} dotClassName={dotClassName} count={levels[key]} />
      ))}
    </View>
  );
}

export function WishLevel({ levels, label = "위시 레벨" }: WishLevelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUp, setIsUp] = useState(false);
  const [chipLayout, setChipLayout] = useState<ChipLayout>({ x: 0, y: 0, height: 0 });
  const [listHeight, setListHeight] = useState(140);
  const chipRef = useRef<View>(null);
  const { height: screenHeight } = useWindowDimensions();

  function handlePress() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    // Modal과 같은 창 기준 좌표를 사용해 상태바 높이가 중복 반영되지 않게 합니다.
    chipRef.current?.measureInWindow((x, y, _width, height) => {
      const spaceBelow = screenHeight - y - height;
      setChipLayout({ x, y, height });
      setIsUp(spaceBelow < listHeight);
      setIsOpen(true);
    });
  }

  const listPosition = isUp
    ? { bottom: screenHeight - chipLayout.y, left: chipLayout.x }
    : { top: chipLayout.y + chipLayout.height, left: chipLayout.x };

  return (
    <View ref={chipRef} className="self-start">
      <Chip
        label={label}
        color="black"
        isOpen={isOpen}
        onPress={handlePress}
        accessibilityLabel="위시 레벨 필터"
      />

      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable className="absolute inset-0" onPress={() => setIsOpen(false)} />
        <View className="absolute" style={listPosition}>
          <LevelList levels={levels} onLayout={setListHeight} />
        </View>
      </Modal>
    </View>
  );
}
