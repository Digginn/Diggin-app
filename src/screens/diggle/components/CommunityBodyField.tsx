import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { colors } from "@/theme";

import { limitPostBody, postBodyLength } from "../domain/postBody";

export function CommunityBodyField({
  value,
  onChangeText,
  isVote,
}: {
  value: string;
  onChangeText: (text: string) => void;
  isVote: boolean;
}) {
  const [hasOverflowed, setOverflowed] = useState(false);
  const count = postBodyLength(value);
  const hasError = (value.length > 0 && count < 5) || hasOverflowed;
  return (
    <View
      className={`w-full rounded-field border-field bg-gray-0 p-4 ${isVote ? "h-[120px]" : "h-[200px]"} ${hasError ? "border-semantic-error" : "border-gray-300"}`}
    >
      <TextInput
        accessibilityLabel={isVote ? "투표글 본문" : "게시글 본문"}
        className="flex-1 p-0 text-gray-900 font-b1"
        multiline
        textAlignVertical="top"
        placeholder={
          isVote
            ? "구매가 고민되는 아이템에 대해 써 주세요. (최소 5글자)"
            : "저장한 아이템에 대해 의견을 나누어 보세요. (최소 5글자)"
        }
        placeholderTextColor={colors.gray[400]}
        value={value}
        onChangeText={(next) => {
          const nextCount = postBodyLength(next);
          if (nextCount > 50) setOverflowed(true);
          else if (nextCount < 50) setOverflowed(false);
          onChangeText(limitPostBody(next));
        }}
      />
      <Text className={`self-end font-note ${hasError ? "text-semantic-error" : "text-gray-500"}`}>
        {count}/50자
      </Text>
    </View>
  );
}
