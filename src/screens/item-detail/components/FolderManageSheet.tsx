import { clsx } from "clsx";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import AddIcon from "@/assets/images/folder/icon-folder-add.svg";
import SelectedIcon from "@/assets/images/folder/icon-folder-selected.svg";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { FolderNameModal } from "@/screens/folder/components/FolderNameModal";

export type ManagedFolder = { id: string; name: string; isOwnedItems?: boolean };

type FolderManageSheetProps = {
  folders: ManagedFolder[];
  selectedFolderIds: string[];
  onClose: () => void;
  onCreateFolder: (name: string) => ManagedFolder;
  onComplete: (ids: string[]) => void;
  /** 게시글 아이템 저장 흐름은 제목과 버튼이 다르고 앞 단계로 돌아갈 수 있다. */
  title?: string;
  completeLabel?: string;
  onBack?: () => void;
};

export function FolderManageSheet({
  folders,
  selectedFolderIds,
  onClose,
  onCreateFolder,
  onComplete,
  title = "폴더 관리",
  completeLabel = "완료",
  onBack,
}: FolderManageSheetProps) {
  const [selectedIds, setSelectedIds] = useState(selectedFolderIds);
  const [isCreating, setIsCreating] = useState(false);
  const listRef = useRef<ScrollView>(null);
  const orderedFolders = [
    ...folders.filter((folder) => folder.isOwnedItems),
    ...folders.filter((folder) => !folder.isOwnedItems),
  ];

  return (
    <BottomSheet
      visible
      onRequestClose={onClose}
      height={556}
      className="rounded-t-[20px]"
      handleClassName="mb-4 h-1 w-9 self-center rounded-sm bg-gray-300"
      scrimOpacity={0.36}
      isKeyboardAvoiding={false}
      overlay={
        isCreating ? (
          <FolderNameModal
            onClose={() => setIsCreating(false)}
            onSubmit={(name) => {
              const folder = onCreateFolder(name);
              setSelectedIds((previous) => [...previous, folder.id]);
              listRef.current?.scrollTo({ y: 0, animated: false });
              return true;
            }}
          />
        ) : undefined
      }
    >
      <View className="flex-1 gap-gutter px-margin">
        <View className="gap-1">
          <Text className="text-gray-900 font-label-20">{title}</Text>
          <Text className="text-gray-600 font-label-14">
            아이템을 담을 폴더를 모두 선택해 주세요.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="새 폴더 만들기"
          className="h-12 items-center justify-center rounded-lg border border-dashed border-gray-300 active:opacity-75"
          onPress={() => setIsCreating(true)}
        >
          <Text className="text-gray-900 font-label-14">+ 새 폴더 만들기</Text>
        </Pressable>
        <ScrollView
          ref={listRef}
          className="flex-1"
          contentContainerClassName="gap-2"
          showsVerticalScrollIndicator={false}
        >
          {orderedFolders.map((folder) => {
            const isSelected = selectedIds.includes(folder.id);
            return (
              <View key={folder.id}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={folder.name}
                  accessibilityState={{ checked: isSelected }}
                  aria-checked={isSelected}
                  className={clsx(
                    "h-[46px] flex-row items-center justify-between rounded pl-4 pr-1.5 active:opacity-75",
                    isSelected && "bg-gray-100",
                  )}
                  onPress={() =>
                    setSelectedIds((previous) =>
                      isSelected
                        ? previous.filter((id) => id !== folder.id)
                        : [...previous, folder.id],
                    )
                  }
                >
                  <Text numberOfLines={1} className="flex-1 text-gray-900 font-b2">
                    {folder.name}
                  </Text>
                  <View className="size-11 items-center justify-center">
                    {isSelected ? <SelectedIcon /> : <AddIcon />}
                  </View>
                </Pressable>
                {folder.isOwnedItems && <View className="mt-2 h-px bg-[#E6E6E6]" />}
              </View>
            );
          })}
        </ScrollView>
        {onBack ? (
          <View className="flex-row justify-between">
            <Button className="w-[155px]" variant="secondary" onPress={onBack}>
              이전으로
            </Button>
            <Button className="w-[155px]" onPress={() => onComplete(selectedIds)}>
              {completeLabel}
            </Button>
          </View>
        ) : (
          <Button size="large" onPress={() => onComplete(selectedIds)}>
            {completeLabel}
          </Button>
        )}
      </View>
    </BottomSheet>
  );
}
