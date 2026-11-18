import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CheckboxDisabled from "@/assets/images/icon-consent-checkbox-disabled.svg";
import CheckboxOff from "@/assets/images/icon-consent-checkbox-off.svg";
import CheckboxOn from "@/assets/images/icon-consent-checkbox-on.svg";

type ConsentBarProps = {
  label: string;
  /** disabled는 해제할 수 없는 필수 약관의 회색 체크 상태다(MY-009). */
  state: "off" | "on" | "disabled";
  isBusy?: boolean;
  onPress?: () => void;
};

/** 약관 상세 하단에 떠 있는 동의 한 줄(Figma ConsentBar). 스크롤 위치와 관계없이 바로 누를 수 있다. */
export function ConsentBar({ label, state, isBusy = false, onPress }: ConsentBarProps) {
  const insets = useSafeAreaInsets();
  const Icon = state === "disabled" ? CheckboxDisabled : state === "on" ? CheckboxOn : CheckboxOff;

  return (
    <View
      className="border-t border-gray-200 bg-gray-0 pl-3 pr-6 pt-[6px]"
      style={{ paddingBottom: insets.bottom + 12 }}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{
          checked: state !== "off",
          disabled: state === "disabled",
          busy: isBusy,
        }}
        disabled={state === "disabled" || isBusy || !onPress}
        onPress={onPress}
        className="h-12 flex-row items-center"
      >
        <View className="size-12 items-center justify-center">
          <Icon width={24} height={24} />
        </View>
        <Text className="text-gray-900 font-b3">{label}</Text>
      </Pressable>
    </View>
  );
}
