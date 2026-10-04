import { clsx } from "clsx";
import { forwardRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import SendSvg from "@/assets/images/icon-send.svg";
import { colors, typography } from "@/theme";

const SEND_ICON_SIZE = 26.667;
// 3줄까지 늘고 그 뒤로는 입력창 안에서 스크롤함
const MAX_INPUT_HEIGHT = 94;
export const COMMENT_MAX_LENGTH = 30;

type CommentInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  errorMessage?: string;
};

export const CommentInput = forwardRef<TextInput, CommentInputProps>(function CommentInput(
  { value, onChangeText, onSend, placeholder = "댓글을 입력해 주세요. (최대 30자)", errorMessage },
  ref,
) {
  const canSend = value.length > 0 && !errorMessage;

  return (
    <View
      className={clsx(
        "w-full overflow-hidden border-t border-gray-200 bg-gray-0 px-margin pb-10 pt-3",
        errorMessage ? "items-start gap-2" : "items-start justify-center",
      )}
    >
      {errorMessage ? (
        <Text className="w-full text-semantic-error font-note">{errorMessage}</Text>
      ) : null}

      <View
        className={clsx(
          "min-h-12 w-full flex-row items-center justify-between rounded border-field bg-gray-0 pl-4 pr-1",
          errorMessage ? "border-semantic-error" : value ? "border-gray-600" : "border-gray-300",
        )}
      >
        <TextInput
          ref={ref}
          multiline
          className="min-w-0 flex-1 self-stretch py-[13px] text-gray-900 font-label-16-medium-input"
          placeholder={placeholder}
          placeholderTextColor={colors.gray[400]}
          style={{
            maxHeight: MAX_INPUT_HEIGHT,
            lineHeight: typography["label-16-medium"].size * 1.4,
          }}
          value={value}
          onChangeText={onChangeText}
        />
        <Pressable
          accessibilityLabel="댓글 등록"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          className="size-12 items-center justify-center active:opacity-75"
          disabled={!canSend}
          onPress={onSend}
        >
          <SendSvg
            width={SEND_ICON_SIZE}
            height={SEND_ICON_SIZE}
            color={canSend ? colors.gray[900] : colors.gray[400]}
          />
        </Pressable>
      </View>
    </View>
  );
});
