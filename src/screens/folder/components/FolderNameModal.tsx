import { type ReactNode, useRef, useState } from "react";
import { Text, View } from "react-native";
import { splitGraphemes } from "unicode-segmenter/grapheme";

import { TextField } from "@/components/Field";
import { ActionModal } from "@/components/modal";

const INITIAL_FOLDER_NAME = "새 폴더";
const MAX_FOLDER_NAME_LENGTH = 7;

type FolderNameModalProps = {
  initialName?: string;
  onClose: () => void;
  onSubmit?: (name: string) => boolean | void | Promise<boolean | void>;
  overlay?: ReactNode;
};

export function FolderNameModal({ initialName, onClose, onSubmit, overlay }: FolderNameModalProps) {
  const isEditing = initialName !== undefined;
  const [name, setName] = useState(initialName ?? INITIAL_FOLDER_NAME);
  const [hasEditedName, setHasEditedName] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  // Figma의 '새 폴더'는 공백을 제외한 3글자로 표시됩니다.
  const characterCount = [...splitGraphemes(name)].filter(
    (character) => !/^\s+$/u.test(character),
  ).length;
  const canSubmit =
    (isEditing || hasEditedName) &&
    characterCount > 0 &&
    characterCount <= MAX_FOLDER_NAME_LENGTH &&
    !isSubmitting &&
    !!onSubmit;

  function handleClose() {
    if (!isSubmittingRef.current) onClose();
  }

  async function handleSubmit() {
    if (!canSubmit || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      if ((await onSubmit?.(name.trim())) !== false) onClose();
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <ActionModal
      visible
      overlay={overlay}
      isKeyboardAvoiding
      keyboardGap={isEditing ? 24 : 40}
      onRequestClose={handleClose}
      onClose={handleClose}
      title={isEditing ? "이름 수정하기" : "새 폴더 만들기"}
      description={
        isEditing ? "폴더의 이름을 수정해주세요." : "아이템을 담을 새 폴더를 만들어주세요."
      }
      isPrimaryDisabled={!canSubmit}
      primaryAction={{ label: isEditing ? "수정 완료" : "폴더 만들기", onPress: handleSubmit }}
    >
      <View className="w-full gap-2">
        <Text className="text-gray-1000 font-b3">
          {isEditing ? "수정한 폴더 이름" : "폴더 이름"}
        </Text>
        <View>
          <TextField
            editable={!isSubmitting}
            selectTextOnFocus={!isEditing}
            accessibilityLabel={isEditing ? "수정한 폴더 이름" : "폴더 이름"}
            value={name}
            className="!border-gray-350 pr-14"
            inputClassName="!text-gray-700"
            onChangeText={(text) => {
              const next = [...splitGraphemes(text)];
              if (
                next.filter((character) => !/^\s+$/u.test(character)).length >
                MAX_FOLDER_NAME_LENGTH
              )
                return;
              setName(text);
              setHasEditedName(true);
            }}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
          <View pointerEvents="none" className="absolute inset-y-0 right-4 justify-center">
            <Text className="text-gray-400 font-meta">
              {characterCount}/{MAX_FOLDER_NAME_LENGTH}
            </Text>
          </View>
        </View>
      </View>
    </ActionModal>
  );
}
