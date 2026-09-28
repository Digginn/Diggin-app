import { useRef, useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";

import { Chip } from "@/components/Chip";
import { colors } from "@/theme";

type Levels = { high: number; medium: number; low: number };

type WishLevelProps = {
  levels: Levels;
};

const LEVEL_CONFIG = [
  { key: "high" as const, label: "높음", dotColor: colors.gray[600] },
  { key: "medium" as const, label: "중간", dotColor: colors.gray[500] },
  { key: "low" as const, label: "낮음", dotColor: colors.gray[400] },
];

function LevelItem({
  label,
  dotColor,
  count,
}: {
  label: string;
  dotColor: string;
  count: number;
}) {
  return (
    <View
      className="flex-row items-center px-3 py-2 rounded-full bg-gray-0 border border-gray-200"
      style={{
        shadowColor: colors.gray[1000],
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 20,
        shadowOpacity: 0.1,
        elevation: 4,
      }}
    >
      <View className="flex-row items-center gap-2">
        <View
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <View className="flex-row items-center gap-1">
          <Text className="font-b3 text-gray-900">{label}</Text>
          <Text className="font-label-14 text-gray-900">
            {count >= 999 ? "999+" : String(count)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function LevelList({
  levels,
  onLayout,
}: {
  levels: Levels;
  onLayout: (height: number) => void;
}) {
  return (
    <View
      className="items-start gap-2 py-2.5"
      onLayout={(e) => onLayout(e.nativeEvent.layout.height)}
    >
      {LEVEL_CONFIG.map(({ key, label, dotColor }) => (
        <LevelItem
          key={key}
          label={label}
          dotColor={dotColor}
          count={levels[key]}
        />
      ))}
    </View>
  );
}

export function WishLevel({ levels }: WishLevelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUp, setIsUp] = useState(false);
  const [chipLayout, setChipLayout] = useState<{ x: number; y: number; height: number }>({ x: 0, y: 0, height: 0 });
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
        label="위시 레벨"
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
        <View style={[{ position: "absolute" }, listPosition]}>
          <LevelList levels={levels} onLayout={setListHeight} />
        </View>
      </Modal>
    </View>
  );
}
