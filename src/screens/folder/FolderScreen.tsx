import { clsx } from "clsx";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";

import { IconNotification, IconSearch } from "@/assets/images/appbar";
import EmptyFolderIcon from "@/assets/images/folder/icon-empty-folder.svg";
import PlusIcon from "@/assets/images/folder/icon-folder-plus.svg";
import FabGlow from "@/assets/images/folder/image-fab-glow.svg";
import FolderWordmark from "@/assets/images/folder/logo-folder-wordmark.svg";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { ActionModal } from "@/components/modal";

import { FolderCard, type FolderItem } from "./components/FolderCard";
import { FolderMenu, type FolderMenuAnchor } from "./components/FolderMenu";
import { FolderNameModal } from "./components/FolderNameModal";
import { FolderSortFilter, type FolderSortOrder } from "./components/FolderSortFilter";
import { FolderToast } from "./components/FolderToast";

const DEFAULT_FOLDERS: FolderItem[] = [
  { id: "default", name: "기본 폴더", itemCount: 0 },
  { id: "owned", name: "나의 소장템", itemCount: 0, isOwnedItems: true },
];
const TOAST_DURATION_MS = 2000;
const FOLDER_MESSAGES = {
  createSuccess: "폴더가 생성되었습니다.",
  renameSuccess: "폴더 이름이 변경되었습니다.",
  deleteSuccess: "폴더가 삭제되었습니다.",
  createError: "폴더를 생성하지 못했습니다. 다시 시도해 주세요.",
  renameError: "폴더 이름을 변경하지 못했습니다. 다시 시도해 주세요.",
  deleteError: "폴더를 삭제하지 못했습니다. 다시 시도해 주세요.",
} as const;

type FolderScreenProps = {
  isError?: boolean;
  onRetry?: () => void;
  folders?: FolderItem[];
  savedItemCount?: number;
  onOpenFolder?: (folder: FolderItem) => void;
  onRenameFolder?: (folder: FolderItem, name: string) => void | Promise<void>;
  onDeleteFolder?: (folder: FolderItem) => void | Promise<void>;
  onSort?: (order: FolderSortOrder) => void;
  onCreateFolder?: (name: string) => void | Promise<void>;
  onSearch?: () => void;
  onNotifications?: () => void;
};

export function FolderScreen({
  isError = false,
  onRetry,
  folders = DEFAULT_FOLDERS,
  savedItemCount = folders.reduce((count, folder) => count + folder.itemCount, 0),
  onOpenFolder,
  onRenameFolder,
  onDeleteFolder,
  onSort,
  onCreateFolder,
  onSearch,
  onNotifications,
}: FolderScreenProps = {}) {
  const { height } = useWindowDimensions();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingRef = useRef(false);
  const [editingFolder, setEditingFolder] = useState<FolderItem | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<FolderItem | null>(null);
  const [selectedFolderMenu, setSelectedFolderMenu] = useState<{
    folder: FolderItem;
    anchor: FolderMenuAnchor;
  } | null>(null);
  const hasFolders = folders.length > 0;
  const columnCount = folders.length >= 7 ? 3 : 2;
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<FolderSortOrder>("latest");
  const sortedFolders = [...folders].sort((left, right) => {
    const leftRank = left.isOwnedItems ? 2 : left.id === "default" ? 1 : 0;
    const rightRank = right.isOwnedItems ? 2 : right.id === "default" ? 1 : 0;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (sortOrder === "item-count") return right.itemCount - left.itemCount;
    return (
      (right.lastItemAddedAt ?? right.createdAt ?? 0) -
      (left.lastItemAddedAt ?? left.createdAt ?? 0)
    );
  });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  async function submitFolderName(name: string, folder?: FolderItem) {
    try {
      if (folder) await onRenameFolder?.(folder, name);
      else await onCreateFolder?.(name);
      setToast({ message: folder ? FOLDER_MESSAGES.renameSuccess : FOLDER_MESSAGES.createSuccess });
      return true;
    } catch {
      Keyboard.dismiss();
      setToast({ message: folder ? FOLDER_MESSAGES.renameError : FOLDER_MESSAGES.createError });
      return false;
    }
  }

  const modalToast = toast ? (
    <View pointerEvents="none" className="absolute inset-x-0 bottom-40">
      <FolderToast message={toast.message} />
    </View>
  ) : undefined;

  return (
    <View className="flex-1 bg-gray-0">
      <StatusBar style="dark" />
      <View style={{ opacity: isSortOpen ? 0.12 : 1 }}>
        <AppBar
          left="logo"
          logo={<FolderWordmark />}
          right={
            !isError &&
            !hasFolders && (
              <>
                <AppBar.IconButton
                  icon={IconSearch}
                  accessibilityLabel="아이템 검색"
                  onPress={onSearch}
                  disabled={!onSearch}
                />
                <AppBar.IconButton
                  icon={IconNotification}
                  accessibilityLabel="알림"
                  onPress={onNotifications}
                  disabled={!onNotifications}
                />
              </>
            )
          }
        />
      </View>
      {isError ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 top-0 items-center justify-center px-margin"
          style={{ height }}
        >
          <View className="items-center gap-margin">
            <Text
              className="text-center text-gray-500 font-b1"
              style={{ includeFontPadding: false }}
            >
              {"폴더를 불러오지 못했습니다.\n잠시 후 다시 시도해주세요."}
            </Text>
            <View className="w-[156px]">
              <Button onPress={() => onRetry?.()} isDisabled={!onRetry}>
                다시 시도
              </Button>
            </View>
          </View>
        </View>
      ) : hasFolders ? (
        <View className="flex-1">
          <View
            pointerEvents="box-none"
            className={clsx(
              "px-margin pt-4",
              isSortOpen && "absolute inset-0 z-20",
              columnCount === 3 ? "pb-2" : "pb-4",
            )}
          >
            <Text className="text-gray-1000 font-label-12-semibold">
              저장한 아이템 {savedItemCount}개
            </Text>
            <View
              pointerEvents="box-none"
              className={clsx("mt-1 items-start", isSortOpen && "flex-1")}
            >
              <FolderSortFilter
                isOpen={isSortOpen}
                value={sortOrder}
                onToggle={() => setIsSortOpen(!isSortOpen)}
                onChange={(order) => {
                  setSortOrder(order);
                  setIsSortOpen(false);
                  onSort?.(order);
                }}
              />
            </View>
          </View>
          {isSortOpen && <View className={columnCount === 3 ? "h-[90px]" : "h-[98px]"} />}
          <ScrollView
            className="flex-1"
            contentContainerClassName={clsx(
              "px-margin pb-20",
              columnCount === 3 ? "gap-margin" : "gap-gutter",
            )}
          >
            {Array.from({ length: Math.ceil(folders.length / columnCount) }, (_, row) => (
              <View
                key={row}
                className={clsx("flex-row", columnCount === 3 ? "gap-[13.5px]" : "gap-gutter")}
              >
                {sortedFolders.slice(row * columnCount, (row + 1) * columnCount).map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    columnCount={columnCount}
                    onPress={onOpenFolder ? () => onOpenFolder(folder) : undefined}
                    onPressMenu={(anchor) => setSelectedFolderMenu({ folder, anchor })}
                  />
                ))}
                {Array.from(
                  { length: Math.max(0, (row + 1) * columnCount - folders.length) },
                  (_, index) => (
                    <View key={`empty-${index}`} className="flex-1" />
                  ),
                )}
              </View>
            ))}
          </ScrollView>
          {isSortOpen && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="보기 순 필터 닫기"
              className="absolute inset-0 z-10"
              style={{
                experimental_backgroundImage:
                  "linear-gradient(to bottom, rgba(255,255,255,0.88), rgba(255,255,255,0))",
              }}
              onPress={() => setIsSortOpen(false)}
            />
          )}
        </View>
      ) : (
        <View
          pointerEvents="none"
          className="absolute inset-x-0 top-0 items-center justify-center px-margin"
          style={{ height }}
        >
          <View className="items-center gap-2">
            <EmptyFolderIcon />
            <Text
              className="text-center text-gray-500 font-b1"
              style={{ includeFontPadding: false }}
            >
              {"아직 생성된 폴더가 없습니다.\n저장한 아이템을 폴더에 정리해 보세요."}
            </Text>
          </View>
        </View>
      )}
      {!isError && (
        <View
          pointerEvents="box-none"
          className="absolute -bottom-[49px] -right-[49px] z-20 size-[200px]"
        >
          <View pointerEvents="none" className="absolute inset-0">
            <FabGlow />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="폴더 추가"
            onPress={() => {
              setToast(null);
              setIsCreateModalOpen(true);
            }}
            className="absolute left-[73px] top-[73px] size-[54px] items-center justify-center rounded-full bg-gray-900 shadow-[0_4px_20px_rgba(0,0,0,0.1)] active:opacity-75"
          >
            <PlusIcon />
          </Pressable>
        </View>
      )}
      {!isError && isCreateModalOpen && (
        <FolderNameModal
          overlay={modalToast}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={onCreateFolder ? (name) => submitFolderName(name) : undefined}
        />
      )}
      {!isError && editingFolder && (
        <FolderNameModal
          overlay={modalToast}
          initialName={editingFolder.name}
          onClose={() => setEditingFolder(null)}
          onSubmit={onRenameFolder ? (name) => submitFolderName(name, editingFolder) : undefined}
        />
      )}
      {!isError && !isCreateModalOpen && !editingFolder && !deletingFolder && toast && (
        <View pointerEvents="none" className="absolute inset-x-0 bottom-20">
          <FolderToast message={toast.message} />
        </View>
      )}
      {!isError && selectedFolderMenu && (
        <FolderMenu
          anchor={selectedFolderMenu.anchor}
          onClose={() => setSelectedFolderMenu(null)}
          onEdit={() => {
            setToast(null);
            setEditingFolder(selectedFolderMenu.folder);
          }}
          onDelete={() => {
            setToast(null);
            setDeletingFolder(selectedFolderMenu.folder);
          }}
        />
      )}
      {!isError && deletingFolder && (
        <ActionModal
          visible
          overlay={modalToast}
          type="2Btn"
          hasTallHeader
          title="폴더 삭제하기"
          description={
            "해당 폴더를 삭제하시겠습니까?\n삭제된 폴더는 복구할 수 없으며, 다른 폴더에 없는 아이템은 기본 폴더로 이동합니다."
          }
          onRequestClose={() => {
            if (!isDeletingRef.current) setDeletingFolder(null);
          }}
          secondaryAction={{
            label: "삭제하기",
            isDisabled: !onDeleteFolder || isDeleting,
            onPress: async () => {
              if (!onDeleteFolder || isDeletingRef.current) return;
              isDeletingRef.current = true;
              setIsDeleting(true);
              try {
                await onDeleteFolder(deletingFolder);
                setDeletingFolder(null);
                setToast({ message: FOLDER_MESSAGES.deleteSuccess });
              } catch {
                setToast({ message: FOLDER_MESSAGES.deleteError });
              } finally {
                isDeletingRef.current = false;
                setIsDeleting(false);
              }
            },
          }}
          primaryAction={{
            label: "취소",
            isDisabled: isDeleting,
            onPress: () => {
              if (!isDeletingRef.current) setDeletingFolder(null);
            },
          }}
        />
      )}
    </View>
  );
}
