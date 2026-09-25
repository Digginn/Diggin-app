import { ScrollView, Text, View } from "react-native";

import { FieldHelperText, SearchField, TextField } from "@/components/Field";

export default function Index() {
  return (
    <ScrollView className="flex-1 bg-gray-0" contentContainerClassName="gap-8 px-margin py-16">
      <View className="gap-3">
        <Text className="text-gray-900 font-h2">text_field</Text>
        <Text className="text-gray-800 font-b3">
          기본, 포커스, 입력, 오류 상태를 확인할 수 있습니다.
        </Text>
        <View className="gap-3">
          <TextField />
          <TextField defaultValue="닉네임을 입력해 주세요." />
          <TextField defaultValue="닉네임을 입력해 주세요." error />
        </View>
      </View>

      <View className="gap-3">
        <Text className="text-gray-900 font-h2">place_holder</Text>
        <View className="gap-3">
          <FieldHelperText />
          <FieldHelperText status="error-duplicate" />
          <FieldHelperText status="error-special-character" />
        </View>
      </View>

      <View className="gap-3">
        <Text className="text-gray-900 font-h2">search_field</Text>
        <SearchField />
        <SearchField defaultValue="입력상태" />
      </View>
    </ScrollView>
  );
}
