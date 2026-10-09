import { cssInterop } from "nativewind";
import { Pressable, Text, View } from "react-native";

import ChevronSvg from "@/assets/images/icon-chevron-top.svg";
import LinkSvg from "@/assets/images/icon-link.svg";

import { Modal, type ModalProps } from "./Modal";
import { ModalButton } from "./ModalButton";

type FolderModalProps = Omit<ModalProps, "children"> & {
  title: string;
  description: string;
  productName?: string;
  selectedFolderName?: string;
  onPressFolderSelect?: () => void;
  onBack?: () => void;
  onLoad?: () => void;
  onSave?: () => void;
};

const ChevronIcon = cssInterop(ChevronSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});
const LinkIcon = cssInterop(LinkSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

export function FolderModal({
  visible,
  onRequestClose,
  onDismiss,
  title,
  description,
  productName,
  selectedFolderName,
  onPressFolderSelect,
  onBack,
  onLoad,
  onSave,
}: FolderModalProps) {
  return (
    <Modal visible={visible} onRequestClose={onRequestClose} onDismiss={onDismiss}>
      <View className="w-full items-center gap-1">
        <View className="flex-row items-start justify-center gap-1">
          {productName ? (
            <View className="size-6 items-center justify-center overflow-hidden">
              <LinkIcon className="size-6" />
            </View>
          ) : null}
          <Text className="text-center text-gray-900 font-label-16-semibold">{title}</Text>
        </View>
        <View className="flex-row items-start justify-center gap-1">
          {productName ? (
            <View className="rounded-field bg-gray-200 px-1.5 py-1">
              <Text className="text-center text-gray-600 font-name-s">{productName}</Text>
            </View>
          ) : null}
          <Text className="max-w-[235px] text-center text-gray-600 font-b3" numberOfLines={1}>
            {description}
          </Text>
        </View>
      </View>

      {selectedFolderName && onPressFolderSelect ? (
        <View className="w-[295px] gap-2">
          <Text className="text-gray-1000 font-b3">폴더 선택</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`폴더 선택: ${selectedFolderName}`}
            accessibilityState={{ expanded: false }}
            className="h-11 flex-row items-center gap-[5px] rounded-field border border-gray-300 bg-gray-0/80 pl-4 pr-[14px] active:opacity-75"
            onPress={onPressFolderSelect}
          >
            <Text className="flex-1 text-gray-900 font-label-16-medium" numberOfLines={1}>
              {selectedFolderName}
            </Text>
            <View className="size-[18px]" style={{ transform: [{ rotate: "-90deg" }] }}>
              <ChevronIcon className="size-[18px]" />
            </View>
          </Pressable>
        </View>
      ) : null}

      {onBack && onLoad ? (
        <View className="w-[295px] flex-row gap-[15px]">
          <View className="flex-1">
            <ModalButton action={{ label: "돌아가기", onPress: onBack }} variant="secondary" />
          </View>
          <View className="w-[140px]">
            <ModalButton action={{ label: "불러오기", onPress: onLoad }} />
          </View>
        </View>
      ) : null}

      {onSave ? (
        <View className="w-[295px]">
          <ModalButton action={{ label: "저장하기", onPress: onSave }} />
        </View>
      ) : null}
    </Modal>
  );
}
