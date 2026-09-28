import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconBack, type SvgIcon } from "@/assets/images/appbar";
import LogoWordmark from "@/assets/images/logo-black.svg";

import { IconButton } from "./IconButton";
import { TextButton } from "./TextButton";

const BAR_HEIGHT = 56;
const SIDE_SLOT = 56;
const PROGRESS_WIDTH = 200;
const PROGRESS_MAX = 100;
const WORDMARK_WIDTH = 76;
const WORDMARK_HEIGHT = 26;

type AppBarProps = {
  left?: "back" | "logo" | "none";
  title?: string;
  progress?: number;
  right?: ReactNode;
  onBack?: () => void;
  backIcon?: SvgIcon;
  backIconSize?: number;
};

function AppBarRoot({
  left = "back",
  title,
  progress,
  right,
  onBack,
  backIcon = IconBack,
  backIconSize = 48,
}: AppBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = onBack ?? (() => router.back());

  return (
    <View className="bg-gray-0" style={{ paddingTop: insets.top }}>
      <View className="relative flex-row items-center" style={{ height: BAR_HEIGHT }}>
        <View className="absolute left-0 h-full justify-center">
          {left === "back" && (
            <IconButton
              icon={backIcon}
              iconSize={backIconSize}
              accessibilityLabel="뒤로 가기"
              onPress={handleBack}
            />
          )}
          {left === "logo" && (
            <View className="pl-5">
              <LogoWordmark width={WORDMARK_WIDTH} height={WORDMARK_HEIGHT} />
            </View>
          )}
        </View>

        <View
          pointerEvents="none"
          className="absolute h-full items-center justify-center"
          style={{ left: SIDE_SLOT, right: SIDE_SLOT }}
        >
          {progress === undefined ? (
            title ? (
              <Text numberOfLines={1} className="text-gray-900 font-label-20">
                {title}
              </Text>
            ) : null
          ) : (
            <View
              className="h-1 overflow-hidden rounded bg-gray-100"
              style={{ width: PROGRESS_WIDTH }}
            >
              <View
                className="h-full rounded bg-gray-600"
                style={{
                  width:
                    (PROGRESS_WIDTH * Math.min(Math.max(progress, 0), PROGRESS_MAX)) / PROGRESS_MAX,
                }}
              />
            </View>
          )}
        </View>

        <View className="absolute right-3 h-full flex-row items-center">{right}</View>
      </View>
    </View>
  );
}

export const AppBar = Object.assign(AppBarRoot, {
  IconButton,
  TextButton,
});
