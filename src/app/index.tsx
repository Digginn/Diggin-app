import { ScrollView, Text, View } from "react-native";

import { BodyTextField, HelperText, SearchField, TextField } from "@/components/Field";

export default function Index() {
  return (
    <ScrollView className="flex-1 bg-gray-0" contentContainerClassName="gap-8 px-margin py-16">
      <View className="gap-3">
        <Text className="text-gray-900 font-h2">text_field</Text>
        <Text className="text-gray-800 font-b3">
          기본, 포커스, 입력, 오류 상태를 확인할 수 있습니다.
        </Text>
        <View className="gap-3">
          <TextField placeholder="닉네임을 입력해 주세요." />
          <TextField placeholder="닉네임을 입력해 주세요." defaultValue="닉네임을 입력해 주세요." />
          <TextField
            placeholder="닉네임을 입력해 주세요."
            defaultValue="닉네임을 입력해 주세요."
            error
          />
        </View>
      </View>

      <View className="gap-3">
        <Text className="text-gray-900 font-h2">helper_text</Text>
        <View className="gap-3">
          <HelperText message="최대 10글자까지 입력 가능합니다." />
          <HelperText status="error" message="이미 사용 중인 닉네임입니다." />
          <HelperText status="error" message="특수문자는 사용이 불가능합니다." />
        </View>
      </View>

      <View className="gap-3">
        <Text className="text-gray-900 font-h2">search_field</Text>
        <SearchField placeholder="찾고 싶은 아이템을 입력하세요" />
        <SearchField placeholder="찾고 싶은 아이템을 입력하세요" defaultValue="입력상태" />
      </View>

      <View className="gap-3">
        <Text className="text-gray-900 font-h2">BodyTextField</Text>
        <Text className="text-gray-800 font-b3">
          5자 미만으로 입력하면 오류 테두리와 글자수 카운터를 표시합니다.
        </Text>
        <View className="gap-5">
          <BodyTextField placeholder="저장한 아이템에 대해 다른 사람들과 의견을 나누어 보세요. (최소 5글자)" />
          <BodyTextField
            placeholder="저장한 아이템에 대해 다른 사람들과 의견을 나누어 보세요. (최소 5글자)"
            defaultValue="작성 중🙂"
          />
          <BodyTextField
            placeholder="저장한 아이템에 대해 다른 사람들과 의견을 나누어 보세요. (최소 5글자)"
            defaultValue="작성중입니다"
          />
        </View>
      </View>
    </ScrollView>
  );
}
