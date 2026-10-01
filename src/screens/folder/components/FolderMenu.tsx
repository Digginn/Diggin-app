import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";

import DeleteIcon from "@/assets/images/folder/icon-folder-delete.svg";
import EditIcon from "@/assets/images/folder/icon-folder-edit.svg";

const MENU_WIDTH = 92;
const MENU_HEIGHT = 96;
const MENU_OFFSET = 24;

export type FolderMenuAnchor = { x: number; y: number; width: number; height: number };

type FolderMenuProps = {
  anchor: FolderMenuAnchor;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function FolderMenu({ anchor, onClose, onEdit, onDelete }: FolderMenuProps) {
  const { width, height } = useWindowDimensions();
  // 선택한 폴더 중심에서 우측 24px. 가장자리에서는 메뉴가 화면 밖으로 잘리지 않게 합니다.
  const left = Math.max(
    MENU_OFFSET,
    Math.min(anchor.x + anchor.width / 2 + MENU_OFFSET, width - MENU_WIDTH - MENU_OFFSET),
  );
  const top = Math.max(
    MENU_OFFSET,
    Math.min(anchor.y + (anchor.height > 130 ? 59 : 40), height - MENU_HEIGHT - MENU_OFFSET),
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="폴더 메뉴 닫기"
        accessibilityRole="button"
        className="absolute inset-0"
        onPress={onClose}
      />
      <View
        className="absolute w-[92px] rounded-field bg-gray-0 shadow-[0_0_10px_rgba(0,0,0,0.2)]"
        style={{ left, top }}
      >
        <Pressable
          accessibilityRole="menuitem"
          accessibilityLabel="폴더 수정하기"
          accessibilityState={{ disabled: !onEdit }}
          disabled={!onEdit}
          onPress={() => {
            onClose();
            onEdit?.();
          }}
          className="h-12 flex-row items-center justify-between pl-2.5 pr-3 active:opacity-75"
        >
          <EditIcon />
          <Text className="text-gray-menu-text font-label-12-semibold">수정하기</Text>
        </Pressable>
        <View
          pointerEvents="none"
          className="absolute inset-x-0 top-12 h-px bg-gray-menu-divider"
        />
        <Pressable
          accessibilityRole="menuitem"
          accessibilityLabel="폴더 삭제하기"
          accessibilityState={{ disabled: !onDelete }}
          disabled={!onDelete}
          onPress={() => {
            onClose();
            onDelete?.();
          }}
          className="h-12 flex-row items-center justify-between pl-2.5 pr-3 active:opacity-75"
        >
          <View className="size-6 items-center justify-center">
            <DeleteIcon />
          </View>
          <Text className="text-semantic-error font-label-12-semibold">삭제하기</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
