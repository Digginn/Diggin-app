import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { colors } from "@/theme";

import { isSingleGraphemeInsertion, limitPostBody, postBodyLength } from "../domain/postBody";

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
  // 5자 미만은 아래 안내만 띄운다. 빨간 표시는 50자에서 더 입력하려 할 때만 쓴다(DGL-005).
  const hasError = hasOverflowed;
  return (
    <View
      className={`h-[120px] w-full rounded-field border-field bg-gray-0 p-4 ${hasError ? "border-semantic-error" : "border-gray-300"}`}
    >
      <TextInput
        accessibilityLabel={isVote ? "투표글 본문" : "게시글 본문"}
        className="flex-1 p-0 text-gray-900 font-b1"
        multiline
        textAlignVertical="top"
        placeholder={
          isVote
            ? "구매가 고민되는 아이템은 투표를 올려 의견을 받아보세요. (5~50자)"
            : "저장한 아이템에 대해 다른 사람들과 의견을 나누어 보세요. (5~50자)"
        }
        placeholderTextColor={colors.gray[400]}
        value={value}
        onChangeText={(next) => {
          const nextCount = postBodyLength(next);
          if (nextCount > 50) {
            setOverflowed(true);
            // 상한에서 한 글자를 입력하면 본문을 유지하고, 여러 글자 붙여넣기만 잘라 반영한다.
            if (count === 50 && isSingleGraphemeInsertion(value, next)) return;
          } else if (nextCount < 50) setOverflowed(false);
          onChangeText(limitPostBody(next));
        }}
      />
      <Text className={`self-end font-note ${hasError ? "text-semantic-error" : "text-gray-600"}`}>
        {count}/{50}자
      </Text>
    </View>
  );
}
