import { Pressable, Text, View } from "react-native";

import ChevronRight from "@/assets/images/icon-chevron-right.svg";
import DiggleIcon from "@/assets/images/nav/icon-nav-diggle-active.svg";
import { colors } from "@/theme";

const ICON_SIZE = 18;
const CHEVRON_WIDTH = 5;
const CHEVRON_HEIGHT = 10;

type VotePromptProps = {
  onPress: () => void;
};

export function VotePrompt({ onPress }: VotePromptProps) {
  return (
    <Pressable
      accessibilityLabel="커뮤니티로 이동"
      accessibilityRole="button"
      className="flex-row items-center justify-center gap-[72px] border-t border-gray-300 bg-gray-100 py-2.5 pr-0.5 active:opacity-75"

      style={{ boxShadow: `0px -15px 30px 0px ${colors.gray[0]}` }}
      onPress={onPress}
    >
      <View className="flex-row items-center gap-[5px]">
        <DiggleIcon width={ICON_SIZE} height={ICON_SIZE} color={colors.gray[800]} />
        <Text className="text-gray-800 font-b3">혼자 결정하기 어렵다면?</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="text-gray-900 font-label-14">커뮤니티로 이동</Text>
        <ChevronRight width={CHEVRON_WIDTH} height={CHEVRON_HEIGHT} />
      </View>
    </Pressable>
  );
}
