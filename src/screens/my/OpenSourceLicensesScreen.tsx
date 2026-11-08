import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "@/components/app-bar";

import licenses from "./constants/openSourceLicenses.json";

function LicenseEntry({ item }: { item: (typeof licenses)[number] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View className="border-b border-gray-300 py-4">
      <Pressable
        accessibilityRole="button"
        disabled={item.notices.length === 0}
        accessibilityLabel={`${item.name} 라이선스`}
        accessibilityState={{ expanded: isExpanded }}
        onPress={() => setIsExpanded(!isExpanded)}
        className="min-h-12 justify-center gap-1"
      >
        <Text className="text-gray-1000 font-label-14">{item.name}</Text>
        <Text className="text-gray-600 font-b4">
          {item.version} · {item.license}
        </Text>
      </Pressable>
      {isExpanded &&
        item.notices.map((notice) => (
          <View key={notice.name} className="mt-4 gap-2">
            <Text className="text-gray-800 font-label-14">{notice.name}</Text>
            <Text selectable className="text-gray-700 font-b4">
              {notice.text}
            </Text>
          </View>
        ))}
    </View>
  );
}

export function OpenSourceLicensesScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <AppBar title="오픈소스 라이센스" />
      <FlatList
        data={licenses}
        keyExtractor={(item) => `${item.name}@${item.version}`}
        renderItem={({ item }) => <LicenseEntry item={item} />}
        contentContainerClassName="px-margin pt-6"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      />
    </View>
  );
}
