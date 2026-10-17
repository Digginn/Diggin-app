import { useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { ActionModal } from "@/components/modal";
import { useToast } from "@/hooks/useToast";
import { FolderNameModal } from "@/screens/folder/components/FolderNameModal";
import { FOLDER_MESSAGES } from "@/screens/folder/constants/folderMessages";
import { FolderDetailScreen } from "@/screens/folder/FolderDetailScreen";
import { useDeleteFolder } from "@/screens/folder/mutations/useDeleteFolder";
import { useRenameFolder } from "@/screens/folder/mutations/useRenameFolder";
import { useFolderCounts } from "@/screens/folder/queries/useFolderCounts";
import { useFolderItems } from "@/screens/folder/queries/useFolderItems";
import type { WishLevelKey } from "@/types/wish-item";

export default function FolderDetailRoute() {
  const params = useLocalSearchParams<{ id: string; name?: string; owned?: string }>();
  const router = useRouter();
  const [name, setName] = useState(params.name ?? "");
  const [isOldestFirst, setIsOldestFirst] = useState(false);
  const [query, setQuery] = useState("");
  const [wishLevel, setWishLevel] = useState<WishLevelKey | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const showToast = useToast();
  const items = useFolderItems(params.id, isOldestFirst ? "oldest" : "latest", wishLevel, query);
  const counts = useFolderCounts(params.id);
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/folder"));

  return (
    <>
      <FolderDetailScreen
        folderName={name}
        isOwnedFolder={params.owned === "1"}
        items={items.data?.pages.flat() ?? []}
        savedItemCount={
          wishLevel ? (counts.data?.levels[wishLevel] ?? 0) : (counts.data?.total ?? 0)
        }
        levels={counts.data?.levels}
        isOldestFirst={isOldestFirst}
        onToggleSort={() => setIsOldestFirst((prev) => !prev)}
        onSubmitSearch={setQuery}
        wishLevel={wishLevel}
        onSelectWishLevel={(level) => setWishLevel((prev) => (prev === level ? null : level))}
        onEndReached={() => {
          if (items.hasNextPage && !items.isFetchingNextPage) void items.fetchNextPage();
        }}
        isError={items.isError}
        onRetry={() => void items.refetch()}
        onBack={goBack}
        onOpenItem={(item) => router.push({ pathname: "/items/[id]", params: { id: item.id } })}
        onEditFolder={() => setIsRenaming(true)}
        onDeleteFolder={() => setIsDeleteConfirmOpen(true)}
      />
      {isRenaming && (
        <FolderNameModal
          initialName={name}
          onClose={() => setIsRenaming(false)}
          onSubmit={async (nextName) => {
            try {
              await renameFolder.mutateAsync({ id: params.id, name: nextName });
              setName(nextName);
              showToast(FOLDER_MESSAGES.renameSuccess);
              return true;
            } catch {
              showToast(FOLDER_MESSAGES.renameError);
              return false;
            }
          }}
        />
      )}
      <ActionModal
        visible={isDeleteConfirmOpen}
        type="2Btn"
        hasTallHeader
        title="폴더 삭제하기"
        description={"해당 폴더를 삭제하시겠습니까?\n삭제된 폴더는 복구할 수 없습니다."}
        onRequestClose={() => setIsDeleteConfirmOpen(false)}
        secondaryAction={{
          label: "삭제하기",
          isDisabled: deleteFolder.isPending,
          onPress: () =>
            deleteFolder.mutate(params.id, {
              onSuccess: () => {
                setIsDeleteConfirmOpen(false);
                showToast(FOLDER_MESSAGES.deleteSuccess);
                goBack();
              },
              onError: () => showToast(FOLDER_MESSAGES.deleteError),
            }),
        }}
        primaryAction={{ label: "취소", onPress: () => setIsDeleteConfirmOpen(false) }}
      />
    </>
  );
}
