import { cssInterop } from "nativewind";
import { useRef, useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";

import TooltipSvg from "@/assets/images/icon-tooltip.svg";
import { Chip } from "@/components/Chip";
import { Tooltip } from "@/components/Tooltip";
import { colors } from "@/theme";
import { WISH_LEVEL_DOT_CLASSNAMES, WISH_LEVEL_LABELS, type WishLevelKey } from "@/types/wish-item";

const HINT_BUTTON_SIZE = 48;

const HintIcon = cssInterop(TooltipSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

type Levels = { high: number; medium: number; low: number };

type ChipLayout = { x: number; y: number; width: number; height: number };

type OpenDirection = "auto" | "up" | "down";

type WishLevelProps = {
  levels: Levels;
  openDirection?: OpenDirection;
  hint?: string;
};

const LEVEL_KEYS: WishLevelKey[] = ["high", "medium", "low"];

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
      className="flex-row items-center gap-2 rounded-full border border-gray-200 bg-gray-0 px-3 py-2"
      style={{
        shadowColor: colors.gray[1000],
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10,
        shadowOpacity: 0.1,
        elevation: 4,
      }}
    >
      <View className={`size-2 rounded-full ${dotClassName}`} />
      <View className="flex-row items-center gap-1">
        <Text className="text-gray-1000 font-b3">{label}</Text>
        <Text className="text-gray-900 font-label-14">{count >= 999 ? "999+" : String(count)}</Text>
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
      {LEVEL_KEYS.map((key) => (
        <LevelItem
          key={key}
          label={WISH_LEVEL_LABELS[key]}
          dotClassName={WISH_LEVEL_DOT_CLASSNAMES[key]}
          count={levels[key]}
        />
      ))}
    </View>
  );
}

export function WishLevel({ levels, openDirection = "auto", hint }: WishLevelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUp, setIsUp] = useState(false);
  const [chipLayout, setChipLayout] = useState<ChipLayout>({ x: 0, y: 0, width: 0, height: 0 });
  const [listHeight, setListHeight] = useState(140);
  const [isHintOpen, setHintOpen] = useState(false);
  const chipRef = useRef<View>(null);
  const { height: screenHeight } = useWindowDimensions();

  function handleClose() {
    setIsOpen(false);
    setHintOpen(false);
  }

  function handlePress() {
    if (isOpen) {
      handleClose();
      return;
    }
    chipRef.current?.measureInWindow((x, y, width, height) => {
      const spaceBelow = screenHeight - y - height;
      setChipLayout({ x, y, width, height });
      setIsUp(openDirection === "auto" ? spaceBelow < listHeight : openDirection === "up");
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

      <Modal visible={isOpen} transparent animationType="none" onRequestClose={handleClose}>
        <Pressable className="absolute inset-0" onPress={handleClose} />
        <View className="absolute" style={listPosition}>
          <LevelList levels={levels} onLayout={setListHeight} />
        </View>

        {hint ? (
          <View
            className="absolute flex-row items-start"
            style={{
              top: chipLayout.y + chipLayout.height / 2 - HINT_BUTTON_SIZE / 2,
              left: chipLayout.x + chipLayout.width,
            }}
          >
            <Pressable
              accessibilityLabel="위시 레벨 설명"
              accessibilityRole="button"
              className="size-12 items-center justify-center active:opacity-75"
              onPress={() => setHintOpen((prev) => !prev)}
            >
              <HintIcon className="size-6" />
            </Pressable>
            {isHintOpen ? (
              <View className="pl-2.5 pt-1">
                <Tooltip arrowPosition="left" message={hint} onClose={() => setHintOpen(false)} />
              </View>
            ) : null}
          </View>
        ) : null}
      </Modal>
    </View>
  );
}
