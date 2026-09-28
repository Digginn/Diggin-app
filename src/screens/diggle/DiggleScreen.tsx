import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { SearchBar } from "@/components/app-bar";

// 임시 확인 화면. SearchBar의 Default / Text 상태를 본다.
export function DiggleScreen() {
  const [keyword, setKeyword] = useState("");

  return (
    <View className="flex-1 bg-gray-0">
      <SearchBar
        onBack={() => {}}
        onChangeText={setKeyword}
        onClear={() => setKeyword("")}
        value={keyword}
      />
      <ScrollView contentContainerClassName="gap-3 px-margin py-6">
        <Text className="text-gray-900 font-label-16-semibold">
          {keyword.length > 0 ? "Text 상태" : "Default 상태"}
        </Text>
        <Text className="text-gray-600 font-b4">
          비어 있으면 placeholder와 검색 아이콘, 입력하면 입력값과 지우기 아이콘이 나옵니다.
          지우기를 누르면 다시 Default로 돌아갑니다.
        </Text>
        <View className="rounded-lg bg-gray-50 p-4">
          <Text className="text-gray-700 font-b4">현재 값: {keyword || "(없음)"}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
