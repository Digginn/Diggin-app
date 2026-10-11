import { type Ref, useEffect, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  Text,
  TextInput,
  type TextInputContentSizeChangeEventData,
  type TextInputProps,
  type TextInputScrollEvent,
  View,
} from "react-native";
import { splitGraphemes } from "unicode-segmenter/grapheme";

import IconClearArea from "@/assets/images/icon-btn-mini-close-white-live-area.svg";
import IconClearMark from "@/assets/images/icon-btn-mini-close-white-vector.svg";
import IconSearch from "@/assets/images/icon-search.svg";
import { colors } from "@/theme";

type TextFieldProps = TextInputProps & {
  ref?: Ref<TextInput>;
  inputClassName?: string;
  isError?: boolean;
  className?: string;
  /** 긴 글이 들어오면 이 높이까지 자라고, 더 길면 안에서 스크롤된다. */
  growsTo?: number;
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
  size?: "default" | "compact";
  className?: string;
  onValidityChange?: (isValid: boolean) => void;
  placeholder: string;
};

const MIN_BODY_TEXT_LENGTH = 5;
const SEARCH_ICON_SIZE = 21;
const CLEAR_AREA_SIZE = 20;
const CLEAR_MARK_SIZE = 7.5;
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

const FIELD_HEIGHT = 44;
// 시안 ScrollIndicator: 폭 3, 영역 안쪽으로 4, 최소 길이 24, 터치 불가.
const BAR_WIDTH = 3;
const BAR_INSET = 4;
const BAR_MIN_LENGTH = 24;
// 칸 높이는 픽셀 격자로 반올림되고 iOS 내용 높이는 소수점 그대로라, 한 줄이어도 내용이 살짝 커 보인다.
const ROUNDING_SLACK = 1;

type ScrollBar = { length: number; offset: number } | null;

/** 넘치지 않으면 null 이다. 끝까지 찬 막대는 알려주는 게 없다. */
export function measureScrollBar(viewport: number, content: number, scrolled: number): ScrollBar {
  if (viewport <= 0 || content - viewport < ROUNDING_SLACK) return null;
  const track = viewport - BAR_INSET * 2;
  const length = Math.min(track, Math.max(BAR_MIN_LENGTH, track * (viewport / content)));
  const progress = Math.min(1, Math.max(0, scrolled / (content - viewport)));
  return { length, offset: BAR_INSET + (track - length) * progress };
}

function useScrollIndicator() {
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const [scrolled, setScrolled] = useState(0);
  const bar = measureScrollBar(viewport, content, scrolled);

  return {
    bar: { bar },
    handleLayout: (event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout.height),
    handleContentSizeChange: (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) =>
      setContent(event.nativeEvent.contentSize.height),
    handleScroll: (event: TextInputScrollEvent) => setScrolled(event.nativeEvent.contentOffset.y),
  };
}

function ScrollIndicator({ bar }: { bar: ScrollBar }) {
  if (!bar) return null;
  return (
    <View
      pointerEvents="none"
      className="absolute w-[3px] rounded-[10px] bg-gray-500"
      style={{ right: BAR_INSET, top: bar.offset, height: bar.length, width: BAR_WIDTH }}
    />
  );
}

export function TextField({
  ref: inputRef,
  inputClassName,
  isError = false,
  className,
  defaultValue,
  growsTo,
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
  const scroll = useScrollIndicator();
  const borderClassName = isError
    ? "border-semantic-error"
    : isActive
      ? "border-semantic-focus"
      : "border-gray-350";

  // 자라는 칸은 세로 가운데가 아니라 위에서부터 쌓인다.
  const frameClassName = growsTo ? "items-start py-2.5" : "h-11 items-center";
  // 줄 간격 없는 -input 은 한 줄일 때만 맞다. 여러 줄은 줄 간격이 있어야 읽힌다.
  const fontClassName =
    growsTo && inputValue.length > 0 ? "font-label-16-medium" : "font-label-16-medium-input";

  return (
    <View
      className={`w-full flex-row rounded-field border bg-gray-0 px-4 ${frameClassName} ${borderClassName} ${className ?? ""}`}
      style={growsTo ? { minHeight: FIELD_HEIGHT, maxHeight: growsTo } : undefined}
    >
      <TextInput
        ref={inputRef}
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? placeholder}
        className={`flex-1 p-0 text-gray-900 ${fontClassName} ${inputClassName ?? ""}`}
        cursorColor={colors.semantic.focus}
        multiline={growsTo ? true : props.multiline}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        onChangeText={handleChangeText}
        onContentSizeChange={growsTo ? scroll.handleContentSizeChange : props.onContentSizeChange}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onLayout={growsTo ? scroll.handleLayout : props.onLayout}
        onScroll={growsTo ? scroll.handleScroll : props.onScroll}
        placeholder={placeholder}
        placeholderTextColor={colors.gray[400]}
        textAlignVertical={growsTo ? "top" : props.textAlignVertical}
        value={inputValue}
      />
      {/* iOS 는 입력칸이 자기 막대를 그리고 RN 에 끌 옵션이 없어서, 같이 그리면 막대가 둘이 된다. */}
      {growsTo && Platform.OS !== "ios" ? <ScrollIndicator {...scroll.bar} /> : null}
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
  size = "default",
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
    : isValid && size !== "compact"
      ? "border-gray-600"
      : "border-gray-300";

  useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  return (
    <View
      className={`relative w-full border-field bg-gray-0 p-4 ${size === "compact" ? "h-[120px] rounded" : "h-[200px] rounded-field"} ${borderClassName} ${className ?? ""}`}
    >
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? placeholder}
        className={`flex-1 p-0 text-gray-900 ${isEmpty ? "font-label-16-medium-input" : "font-b1"}`}
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
        className="flex-1 p-0 text-gray-900 font-b1-input"
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
            <View className="absolute">
              <IconClearArea width={CLEAR_AREA_SIZE} height={CLEAR_AREA_SIZE} />
            </View>
            <IconClearMark width={CLEAR_MARK_SIZE} height={CLEAR_MARK_SIZE} />
          </View>
        </Pressable>
      ) : (
        <View className="size-12 items-center justify-center">
          <IconSearch width={SEARCH_ICON_SIZE} height={SEARCH_ICON_SIZE} />
        </View>
      )}
    </View>
  );
}
