import { useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconBack } from "@/assets/images/appbar";
import { SearchField } from "@/components/Field";

import { IconButton } from "./IconButton";

const BAR_HEIGHT = 56;
const DEFAULT_PLACEHOLDER = "찾고 싶은 아이템을 입력하세요";

type SearchBarProps = Omit<ComponentProps<typeof SearchField>, "className"> & {
  onBack?: () => void;
};

export function SearchBar({ onBack, placeholder = DEFAULT_PLACEHOLDER, ...props }: SearchBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = onBack ?? (() => router.back());

  return (
    <View className="bg-gray-0" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center pr-3" style={{ height: BAR_HEIGHT }}>
        <IconButton icon={IconBack} accessibilityLabel="뒤로 가기" onPress={handleBack} />
        <View className="flex-1">
          <SearchField placeholder={placeholder} {...props} />
        </View>
      </View>
    </View>
  );
}
