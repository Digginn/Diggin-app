import { cssInterop } from "nativewind";
import { useState } from "react";
import { Pressable, ScrollView, Text, View, type ViewStyle } from "react-native";

import ChevronSvg from "@/assets/images/icon-chevron-down.svg";
import { colors } from "@/theme";

const ChevronIcon = cssInterop(ChevronSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

export type DropdownOption = {
  value: string;
  label: string;
};

type DropdownProps = {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  width?: ViewStyle["width"];
  placeholder?: string;
};

const ROW_HEIGHT = 44;
const MAX_VISIBLE_ROWS = 5;

export function Dropdown({
  options,
  value,
  onChange,
  width = "100%",
  placeholder = "선택",
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? placeholder;
  const visibleOptions = options.filter((option) => option.value !== value);
  const contentHeight = visibleOptions.length * ROW_HEIGHT;
  const listHeight = Math.min(contentHeight, MAX_VISIBLE_ROWS * ROW_HEIGHT);
  // 커스텀 스크롤바: 전체 콘텐츠 높이 대비 보이는 영역 비율로 thumb 크기와 위치 계산
  const trackHeight = listHeight - 8;
  const thumbHeight =
    contentHeight > listHeight ? Math.max(24, (trackHeight * listHeight) / contentHeight) : 0;
  const maxScrollOffset = Math.max(0, contentHeight - listHeight);
  const clampedScrollOffset = Math.max(0, Math.min(scrollOffset, maxScrollOffset));
  const thumbTop = maxScrollOffset
    ? (clampedScrollOffset / maxScrollOffset) * (trackHeight - thumbHeight)
    : 0;

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
    setScrollOffset(0);
  }

  return (
    <View style={{ width, minWidth: 172, zIndex: isOpen ? 10 : undefined }}>
      <View
        style={
          isOpen
            ? {
                backgroundColor: colors.gray[0],
                borderRadius: 5,
                shadowColor: colors.gray[1000],
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 10,
                elevation: 4,
              }
            : undefined
        }
      >
        <View style={isOpen ? { borderRadius: 5, overflow: "hidden" } : undefined}>
          <Pressable
            onPress={() => setIsOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={selectedLabel}
            accessibilityState={{ expanded: isOpen }}
            className="h-11 flex-row items-center gap-[5px] bg-gray-0 px-4"
            style={
              isOpen
                ? {
                    borderBottomWidth: visibleOptions.length > 0 ? 1 : 0,
                    borderBottomColor: "rgba(236,236,236,0.2)",
                  }
                : {
                    borderWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: colors.gray[300],
                    borderRadius: 5,
                  }
            }
          >
            <Text numberOfLines={1} className="flex-1 text-gray-900 font-label-16-medium">
              {selectedLabel}
            </Text>
            <View
              className="size-6 items-center justify-center"
              style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}
            >
              <ChevronIcon className="size-[18px]" />
            </View>
          </Pressable>

          {isOpen && visibleOptions.length > 0 && (
            <View style={{ height: listHeight }}>
              <ScrollView
                nestedScrollEnabled
                onScroll={(event) => setScrollOffset(event.nativeEvent.contentOffset.y)}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
              >
                {visibleOptions.map((option, index) => (
                  <Pressable
                    key={option.value}
                    onPress={() => handleSelect(option.value)}
                    accessibilityRole="menuitem"
                    accessibilityLabel={option.label}
                    className="justify-center bg-gray-0 px-4 active:opacity-75"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <Text numberOfLines={1} className="text-gray-900 font-label-16-medium">
                      {option.label}
                    </Text>
                    {index < visibleOptions.length - 1 && (
                      <View className="absolute bottom-0 left-0 right-0 h-px bg-gray-200 opacity-20" />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
              {thumbHeight > 0 && (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    right: 4,
                    top: thumbTop + 4,
                    width: 2,
                    height: thumbHeight,
                    borderRadius: 10,
                    backgroundColor: colors.gray[500],
                  }}
                />
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
