import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { useState } from "react";
import { Pressable, Text, TextInput, type TextInputProps, View } from "react-native";

import { colors } from "@/theme";

type TextFieldProps = TextInputProps & {
  error?: boolean;
  className?: string;
};

type FieldHelperTextStatus = "default" | "error-duplicate" | "error-special-character";

type FieldHelperTextProps = {
  status?: FieldHelperTextStatus;
  message?: string;
  className?: string;
};

type SearchFieldProps = TextInputProps & {
  onClear?: () => void;
  className?: string;
};

const fieldHelperText = {
  "default": "최대 10글자까지 입력 가능합니다.",
  "error-duplicate": "이미 사용 중인 닉네임 입니다.",
  "error-special-character": "특수문자는 사용이 불가능합니다.",
} as const;

const StyledImage = cssInterop(Image, { className: "style" });

function useInputValue(
  value: string | undefined,
  defaultValue: string | undefined,
  onChangeText?: (text: string) => void,
) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const inputValue = isControlled ? value : uncontrolledValue;

  const handleChangeText = (text: string) => {
    if (!isControlled) setUncontrolledValue(text);
    onChangeText?.(text);
  };

  return { inputValue, handleChangeText };
}

export function TextField({
  error = false,
  className,
  defaultValue,
  onBlur,
  onChangeText,
  onFocus,
  placeholder = "닉네임을 입력해 주세요.",
  value,
  ...props
}: TextFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const { inputValue, handleChangeText } = useInputValue(value, defaultValue, onChangeText);
  const isActive = isFocused || inputValue.length > 0;
  const borderClassName = error
    ? "border-semantic-error"
    : isActive
      ? "border-semantic-focus"
      : "border-gray-350";

  return (
    <View
      className={`h-11 w-full flex-row items-center rounded-[5px] border bg-gray-0 px-4 ${borderClassName} ${className ?? ""}`}
    >
      {inputValue.length === 0 && (
        <Text
          pointerEvents="none"
          className="absolute left-4 top-[10px] text-gray-placeholder font-label-16-medium"
        >
          {placeholder}
        </Text>
      )}
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? placeholder}
        className="flex-1 p-0 text-gray-900 font-label-16-medium"
        cursorColor={colors.semantic.focus}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        onChangeText={handleChangeText}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        placeholder=""
        placeholderTextColor={colors.gray.placeholder}
        value={inputValue}
      />
    </View>
  );
}

export function FieldHelperText({ status = "default", message, className }: FieldHelperTextProps) {
  const isError = status !== "default";

  return (
    <Text
      className={`font-note ${isError ? "text-semantic-error" : "text-gray-600"} ${className ?? ""}`}
    >
      {message ?? fieldHelperText[status]}
    </Text>
  );
}

export function SearchField({
  className,
  defaultValue,
  onChangeText,
  onClear,
  placeholder = "찾고 싶은 아이템을 입력하세요.",
  value,
  ...props
}: SearchFieldProps) {
  const { inputValue, handleChangeText } = useInputValue(value, defaultValue, onChangeText);
  const hasText = inputValue.length > 0;

  const handleClear = () => {
    handleChangeText("");
    onClear?.();
  };

  return (
    <View
      className={`h-12 w-full max-w-[268px] flex-row items-center rounded-full border-[1.5px] border-gray-300 bg-gray-0 pl-4 pr-1 ${className ?? ""}`}
    >
      {!hasText && (
        <Text pointerEvents="none" className="absolute left-4 top-3 text-gray-placeholder font-b1">
          {placeholder}
        </Text>
      )}
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? placeholder}
        className="flex-1 p-0 text-gray-900 font-b1"
        onChangeText={handleChangeText}
        placeholder=""
        placeholderTextColor={colors.gray.placeholder}
        returnKeyType="search"
        value={inputValue}
      />
      {hasText ? (
        <Pressable
          accessibilityLabel="검색어 지우기"
          accessibilityRole="button"
          className="size-12 items-center justify-center"
          hitSlop={0}
          onPress={handleClear}
        >
          <View className="size-5 items-center justify-center">
            <StyledImage
              source={require("@/assets/images/icon-btn-mini-close-white-live-area.svg")}
              className="absolute size-5"
            />
            <StyledImage
              source={require("@/assets/images/icon-btn-mini-close-white-vector.svg")}
              className="size-[7.5px]"
            />
          </View>
        </Pressable>
      ) : (
        <View className="size-12 items-center justify-center">
          <StyledImage
            source={require("@/assets/images/icon-search.svg")}
            className="size-[21px]"
          />
        </View>
      )}
    </View>
  );
}
