import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, type TextInputProps, View } from "react-native";
import { splitGraphemes } from "unicode-segmenter/grapheme";

import { colors } from "@/theme";

type TextFieldProps = TextInputProps & {
  error?: boolean;
  className?: string;
};

type HelperTextProps = {
  status?: "default" | "error";
  message: string;
  className?: string;
};

type SearchFieldProps = TextInputProps & {
  onClear?: () => void;
  className?: string;
};

type BodyTextFieldProps = Omit<TextInputProps, "multiline" | "placeholder"> & {
  className?: string;
  onValidityChange?: (isValid: boolean) => void;
  placeholder: string;
};

const MIN_BODY_TEXT_LENGTH = 5;
const StyledImage = cssInterop(Image, { className: "style" });
function countBodyTextCharacters(value: string) {
  let count = 0;

  for (const grapheme of splitGraphemes(value)) {
    if (!/^\s+$/u.test(grapheme)) count += 1;
  }

  return count;
}

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
  placeholder,
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
      className={`h-11 w-full flex-row items-center rounded-field border bg-gray-0 px-4 ${borderClassName} ${className ?? ""}`}
    >
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
        placeholder={placeholder}
        placeholderTextColor={colors.gray.placeholder}
        value={inputValue}
      />
    </View>
  );
}

export function HelperText({ status = "default", message, className }: HelperTextProps) {
  const isError = status === "error";

  return (
    <Text
      className={`font-note ${isError ? "text-semantic-error" : "text-gray-600"} ${className ?? ""}`}
    >
      {message}
    </Text>
  );
}

export function BodyTextField({
  className,
  defaultValue,
  onChangeText,
  onValidityChange,
  placeholder,
  value,
  ...props
}: BodyTextFieldProps) {
  const { inputValue, handleChangeText } = useInputValue(value, defaultValue, onChangeText);
  const characterCount = countBodyTextCharacters(inputValue);
  const isEmpty = inputValue.length === 0;
  const isValid = characterCount >= MIN_BODY_TEXT_LENGTH;
  const isError = !isEmpty && !isValid;
  const borderClassName = isError
    ? "border-semantic-error"
    : isValid
      ? "border-gray-600"
      : "border-gray-300";

  useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  return (
    <View
      className={`relative h-[200px] w-full rounded-field border-field bg-gray-0 p-4 ${borderClassName} ${className ?? ""}`}
    >
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? placeholder}
        className={`flex-1 p-0 text-gray-900 ${isEmpty ? "font-label-16-medium" : "font-b1"}`}
        multiline
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.gray[400]}
        textAlignVertical="top"
        value={inputValue}
      />
      {isError && (
        <Text className="absolute bottom-4 right-4 text-semantic-error font-note">
          {characterCount}/{MIN_BODY_TEXT_LENGTH}자
        </Text>
      )}
    </View>
  );
}

export function SearchField({
  className,
  defaultValue,
  onChangeText,
  onClear,
  placeholder,
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
      className={`h-12 w-full flex-row items-center rounded-full border-field border-gray-300 bg-gray-0 pl-4 pr-1 ${className ?? ""}`}
    >
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? placeholder}
        className="flex-1 p-0 text-gray-900 font-b1"
        onChangeText={handleChangeText}
        placeholder={placeholder}
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
