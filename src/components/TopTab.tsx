import { Pressable, Text, View } from "react-native";

export type TopTabItem = {
  key: string;
  label: string;
};

type TopTabProps = {
  items: TopTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
};

export function TopTab({ items, activeKey, onChange }: TopTabProps) {
  return (
    <View accessibilityRole="tablist" className="h-[48px] flex-row bg-gray-0 px-margin">
      {items.map((item) => {
        const isActive = item.key === activeKey;

        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            className={`flex-1 items-center justify-center border-b-[1.5px] ${
              isActive ? "border-gray-900" : "border-gray-300"
            }`}
          >
            <Text className="text-gray-900 font-label-16-medium">{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
