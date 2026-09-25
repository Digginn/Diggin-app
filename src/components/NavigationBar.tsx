import { type Tabs } from "expo-router";
import type { ComponentProps, FC } from "react";
import { Pressable, Text, View } from "react-native";
import type { SvgProps } from "react-native-svg";

import {
  IconAllActive,
  IconAllInactive,
  IconDiggleActive,
  IconDiggleInactive,
  IconFolderActive,
  IconFolderInactive,
  IconMyActive,
  IconMyInactive,
} from "@/assets/images/nav";
import { colors } from "@/theme";

type NavigationBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

type TabConfig = {
  label: string;
  ActiveIcon: FC<SvgProps>;
  InactiveIcon: FC<SvgProps>;
};

const ICON_SIZE = 28;

// 라우트 파일명 → 탭에 표시할 라벨과 아이콘
const TABS: Record<string, TabConfig> = {
  index: { label: "ALL", ActiveIcon: IconAllActive, InactiveIcon: IconAllInactive },
  folder: { label: "FOLDER", ActiveIcon: IconFolderActive, InactiveIcon: IconFolderInactive },
  diggle: { label: "DIGGLE", ActiveIcon: IconDiggleActive, InactiveIcon: IconDiggleInactive },
  my: { label: "MY", ActiveIcon: IconMyActive, InactiveIcon: IconMyInactive },
};

export function NavigationBar({ state, navigation }: NavigationBarProps) {
  return (
    <View
      className="flex-row items-center justify-center gap-gutter rounded-t-[20px] bg-gray-900 px-margin"
      style={{
        boxShadow: "0px 0px 6px rgba(0, 0, 0, 0.12)",
      }}
    >
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;

        const isFocused = state.index === index;
        const Icon = isFocused ? tab.ActiveIcon : tab.InactiveIcon;

        const onPress = () => {
          // tabPress 이벤트를 먼저 보내야 "같은 탭 다시 누르면 맨 위로" 같은 기본 동작이 살아있음
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={tab.label}
            className="h-[80px] w-[72px] items-center pt-2"
          >
            <View className="h-[53px] items-center justify-center gap-1">
              <Icon
                width={ICON_SIZE}
                height={ICON_SIZE}
                color={isFocused ? colors.gray[0] : colors.gray[500]}
              />
              <Text
                className={
                  isFocused
                    ? "text-gray-0 font-label-12-semibold"
                    : "text-gray-500 font-label-12-regular"
                }
              >
                {tab.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
