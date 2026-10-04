import { clsx } from "clsx";
import { cssInterop } from "nativewind";
import { Pressable, Text, View } from "react-native";

import ChevronSvg from "@/assets/images/icon-chevron.svg";
import { colors } from "@/theme";
import { WISH_LEVEL_DOT_CLASSNAMES, WISH_LEVEL_LABELS, type WishLevelKey } from "@/types/wish-item";

const ChevronIcon = cssInterop(ChevronSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true, color: true } },
});

const LEVEL_KEYS: WishLevelKey[] = ["high", "medium", "low"];

const MENU_SHADOW = {
  shadowColor: colors.gray[1000],
  shadowOffset: { width: 0, height: 4 },
  shadowRadius: 10,
  shadowOpacity: 0.1,
  elevation: 4,
};

type WishLevelSelectProps = {
  level: WishLevelKey | null;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (level: WishLevelKey) => void;
  className?: string;
};

export function WishLevelSelect({
  level,
  isOpen,
  onToggle,
  onSelect,
  className,
}: WishLevelSelectProps) {
  return (
    <View className={clsx("items-end", className)} style={{ zIndex: isOpen ? 10 : undefined }}>
      {isOpen ? (
        <View className="absolute bottom-10 right-0 items-start gap-2">
          {LEVEL_KEYS.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="menuitem"
              accessibilityLabel={WISH_LEVEL_LABELS[key]}
              className="flex-row items-center gap-2 rounded-full border border-gray-200 bg-gray-0 px-3 py-2 active:opacity-75"
              style={MENU_SHADOW}
              onPress={() => onSelect(key)}
            >
              <View className={`size-2 rounded-full ${WISH_LEVEL_DOT_CLASSNAMES[key]}`} />
              <Text className="text-gray-1000 font-b3">{WISH_LEVEL_LABELS[key]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`위시 레벨 ${level ? WISH_LEVEL_LABELS[level] : "미선택"}`}
        accessibilityState={{ expanded: isOpen }}
        className="h-8 flex-row items-center justify-center gap-2 rounded-full border border-gray-300 bg-gray-0 px-3 active:opacity-75"
        onPress={onToggle}
      >
        {level ? (
          <View className="flex-row items-center gap-1">
            <View className={`size-2 rounded-full ${WISH_LEVEL_DOT_CLASSNAMES[level]}`} />
            <Text className="text-gray-1000 font-b3">{WISH_LEVEL_LABELS[level]}</Text>
          </View>
        ) : (
          <Text className="text-gray-900 font-label-14">미선택</Text>
        )}
        {/* 목록은 위로 열리므로 닫혔을 때 위쪽, 열렸을 때 아래쪽을 가리킨다. */}
        <View
          className="size-4 items-center justify-center"
          style={{ transform: [{ rotate: isOpen ? "0deg" : "180deg" }] }}
        >
          <ChevronIcon className="size-3 text-gray-900" />
        </View>
      </Pressable>
    </View>
  );
}
