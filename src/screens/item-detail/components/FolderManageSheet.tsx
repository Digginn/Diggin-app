import { clsx } from "clsx";
import { type ReactNode, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import AddIcon from "@/assets/images/folder/icon-folder-add.svg";
import SelectedIcon from "@/assets/images/folder/icon-folder-selected.svg";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { ActionModal } from "@/components/modal";
import { FolderNameModal } from "@/screens/folder/components/FolderNameModal";
import { FolderToast } from "@/screens/folder/components/FolderToast";
import { FOLDER_MESSAGES } from "@/screens/folder/constants/folderMessages";

export type ManagedFolder = { id: string; name: string; isOwnedItems?: boolean };

type FolderManageSheetProps = {
  folders: ManagedFolder[];
  selectedFolderIds: string[];
  onClose: () => void;
  onCreateFolder: (name: string) => ManagedFolder | Promise<ManagedFolder>;
  /** 저장 요청이면 Promise를 돌려준다. 끝날 때까지 다시 누르거나 닫을 수 없다. */
  onComplete: (ids: string[]) => void | Promise<unknown>;
  /** 게시글 아이템 저장 흐름은 제목과 버튼이 다르고 앞 단계로 돌아갈 수 있다. */
  title?: string;
  completeLabel?: string;
  onBack?: () => void;
  backLabel?: string;
  /**
   * 저장 응답 전에 선택을 바꾸거나 다시 누르면 서버 상태와 마지막 선택이 어긋나 막는다.
   * 이미 보낸 요청은 닫아도 저장되니 취소·끌어내리기도 막는다.
   */
  isCompleting?: boolean;
  /** 시트가 네이티브 모달이라 저장 실패는 시트 위 토스트로 알린다. */
  errorMessage?: string;
  onErrorDismiss?: () => void;
  isNewItem?: boolean;
  overlay?: ReactNode;
  getCreateErrorMessage?: (error: unknown) => string;
  isInline?: boolean;
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
  backLabel = "이전으로",
  isCompleting = false,
  errorMessage,
  onErrorDismiss,
  isNewItem = false,
  overlay,
  getCreateErrorMessage,
  isInline,
}: FolderManageSheetProps) {
  const [selectedIds, setSelectedIds] = useState(selectedFolderIds);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pendingOwnedFolderId, setPendingOwnedFolderId] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);
  // isCompleting은 다시 그린 뒤에야 버튼을 막아, 그 사이 들어온 연타는 여기서 막는다.
  const isSubmittingRef = useRef(false);
  const orderedFolders = [
    ...folders.filter((folder) => folder.isOwnedItems),
    ...folders.filter((folder) => !folder.isOwnedItems),
  ];

  async function complete() {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      await onComplete(selectedIds);
    } catch {
      // 실패는 부모가 errorMessage로 알린다.
    } finally {
      isSubmittingRef.current = false;
    }
  }

  function close() {
    if (!isSubmittingRef.current) onClose();
  }

  return (
    <BottomSheet
      toastMessage={errorMessage}
      toastVariant="error"
      onToastDismiss={onErrorDismiss}
      visible
      isInline={isInline}
      onRequestClose={close}
      isCloseConfirmed={isCompleting}
      maxHeight={702}
      height={!isInline && isNewItem && folders.length >= 9 ? 702 : undefined}
      className="rounded-t-[20px]"
      handleClassName="mb-4 h-1 w-9 self-center rounded-sm bg-gray-300"
      scrimOpacity={0.36}
      isKeyboardAvoiding={false}
      // 목록이 스크롤되니 끌어내리기는 핸들과 제목에서만 받는다.
      header={
        <View className="gap-1 px-margin pb-4">
          <Text className="text-gray-900 font-label-20">{title}</Text>
          <Text className="text-gray-600 font-label-14">
            아이템을 담을 폴더를 모두 선택해 주세요.
          </Text>
        </View>
      }
      overlay={
        overlay ??
        (isCreating ? (
          <FolderNameModal
            overlay={
              createError ? (
                <View pointerEvents="none" className="absolute inset-x-0 bottom-40">
                  <FolderToast message={createError} />
                </View>
              ) : undefined
            }
            onClose={() => {
              setIsCreating(false);
              setCreateError(null);
            }}
            onSubmit={async (name) => {
              try {
                const folder = await onCreateFolder(name);
                setSelectedIds((previous) => [...previous, folder.id]);
                listRef.current?.scrollTo({ y: 0, animated: false });
                setCreateError(null);
                return true;
              } catch (error) {
                setCreateError(getCreateErrorMessage?.(error) ?? FOLDER_MESSAGES.createError);
                return false;
              }
            }}
          />
        ) : (
          <ActionModal
            visible={pendingOwnedFolderId !== null}
            type="2Btn"
            title="기존 폴더에서도 삭제할까요?"
            description={"나의 소장템에 추가한 후,\n기존 폴더의 아이템을 유지할지 선택해 주세요."}
            secondaryAction={{
              label: "유지하기",
              onPress: () => setPendingOwnedFolderId(null),
            }}
            primaryAction={{
              label: "삭제하기",
              onPress: () => {
                setSelectedIds((previous) =>
                  previous.filter((id) =>
                    folders.some((folder) => folder.id === id && folder.isOwnedItems),
                  ),
                );
                setPendingOwnedFolderId(null);
              },
            }}
            onRequestClose={() => {
              setSelectedIds((previous) => previous.filter((id) => id !== pendingOwnedFolderId));
              setPendingOwnedFolderId(null);
            }}
          />
        ))
      }
    >
      {/* 높이를 정하지 않아 폴더 수만큼 자라고, maxHeight 에 닿으면 목록이 줄며 스크롤된다.
          공유 카드는 높이가 고정이라 목록이 남은 높이를 채우고 버튼은 맨 아래에 둔다. */}
      <View className={clsx("gap-gutter px-margin", isInline ? "flex-1" : "shrink")}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="새 폴더 만들기"
          accessibilityState={{ disabled: isCompleting }}
          disabled={isCompleting}
          className="h-12 items-center justify-center rounded-lg border border-dashed border-gray-300 active:opacity-75"
          onPress={() => setIsCreating(true)}
        >
          <Text className="text-gray-900 font-label-14">+ 새 폴더 만들기</Text>
        </Pressable>
        <ScrollView
          ref={listRef}
          className={isInline ? "flex-1" : "grow-0"}
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
                  accessibilityState={{ checked: isSelected, disabled: isCompleting }}
                  disabled={isCompleting}
                  aria-checked={isSelected}
                  className={clsx(
                    "h-12 flex-row items-center justify-between rounded pl-4 pr-1.5 active:opacity-75",
                    isSelected && "bg-gray-100",
                  )}
                  onPress={() => {
                    setSelectedIds((previous) =>
                      isSelected
                        ? previous.filter((id) => id !== folder.id)
                        : [...previous, folder.id],
                    );
                    // 담겨 있는 일반 폴더가 있을 때만 그 폴더에서 뺄지 묻는다.
                    const hasCustomFolder = selectedIds.some((id) =>
                      folders.some((other) => other.id === id && !other.isOwnedItems),
                    );
                    if (!isNewItem && folder.isOwnedItems && !isSelected && hasCustomFolder)
                      setPendingOwnedFolderId(folder.id);
                  }}
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
          <View className="flex-row gap-4">
            <Button
              className="flex-1"
              variant="secondary"
              isDisabled={isCompleting}
              onPress={() => {
                if (!isSubmittingRef.current) onBack();
              }}
            >
              {backLabel}
            </Button>
            <Button className="flex-1" isDisabled={isCompleting} onPress={complete}>
              {completeLabel}
            </Button>
          </View>
        ) : (
          <Button size="large" isDisabled={isCompleting} onPress={complete}>
            {completeLabel}
          </Button>
        )}
      </View>
    </BottomSheet>
  );
}
