import { cssInterop } from "nativewind";
import { Pressable, Text, View } from "react-native";

import ChevronSvg from "@/assets/images/icon-chevron-top.svg";
import LinkSvg from "@/assets/images/icon-link.svg";

import { Modal, type ModalProps } from "./Modal";
import { ModalButton } from "./ModalButton";

type FolderModalProps = Omit<ModalProps, "children"> & {
  title: string;
  productName: string;
  description: string;
  selectedFolderName: string;
  onPressFolderSelect: () => void;
  onBack: () => void;
  onLoad: () => void;
  onSave: () => void;
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
  title,
  productName,
  description,
  selectedFolderName,
  onPressFolderSelect,
  onBack,
  onLoad,
  onSave,
}: FolderModalProps) {
  return (
    <Modal visible={visible} onRequestClose={onRequestClose}>
      <View className="items-center gap-1">
        <View className="flex-row items-center gap-1">
          <View className="size-6 items-center justify-center overflow-hidden">
            <LinkIcon className="size-6" />
          </View>
          <Text className="text-gray-900 font-label-16-semibold">{title}</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="rounded-field bg-gray-200 px-1.5 py-1">
            <Text className="text-gray-600 font-name-s">{productName}</Text>
          </View>
          <Text className="max-w-[235px] text-gray-600 font-b3" numberOfLines={1}>
            {description}
          </Text>
        </View>
      </View>
      <View className="w-[295px] gap-2">
        <Text className="text-gray-1000 font-b3">폴더 선택</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`폴더 선택: ${selectedFolderName}`}
          className="h-12 flex-row items-center rounded-field border border-gray-300 px-4"
          onPress={onPressFolderSelect}
        >
          <Text className="flex-1 text-gray-900 font-label-16-medium">{selectedFolderName}</Text>
          {/* rotate-* className은 --tw-* 변수 기본값이 유니버설 셀렉터에만 있어
              네이티브에서 적용되지 않는다. 회전은 style로 준다. */}
          <View className="size-[18px]" style={{ transform: [{ rotate: "-90deg" }] }}>
            <ChevronIcon className="size-[18px]" />
          </View>
        </Pressable>
      </View>
      <View className="w-[295px] flex-row gap-modal-action">
        <View className="w-[140px]">
          <ModalButton action={{ label: "돌아가기", onPress: onBack }} variant="secondary" />
        </View>
        <View className="w-[140px]">
          <ModalButton action={{ label: "불러오기", onPress: onLoad }} />
        </View>
      </View>
      <Pressable
        className="h-12 w-[295px] items-center justify-center rounded-field bg-gray-900"
        onPress={onSave}
      >
        <Text className="text-gray-0 font-label-16-semibold">저장하기</Text>
      </Pressable>
    </Modal>
  );
}
