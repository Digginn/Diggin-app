import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { AppBar } from "@/components/app-bar";
import { ErrorState } from "@/components/ErrorState";
import { Spinner } from "@/components/Loading";
import { MemberOnly } from "@/components/MemberOnly";
import { ActionModal } from "@/components/modal";
import { TOAST_MESSAGES } from "@/constants/messages";
import { useFolders } from "@/hooks/useFolders";
import { useToast } from "@/hooks/useToast";
import { FolderNameModal } from "@/screens/folder/components/FolderNameModal";
import { FOLDER_MESSAGES } from "@/screens/folder/constants/folderMessages";
import { FolderDetailScreen } from "@/screens/folder/FolderDetailScreen";
import { useDeleteFolder } from "@/screens/folder/mutations/useDeleteFolder";
import { useRenameFolder } from "@/screens/folder/mutations/useRenameFolder";
import { useFolderCounts } from "@/screens/folder/queries/useFolderCounts";
import { useFolderItems } from "@/screens/folder/queries/useFolderItems";
import type { WishLevelKey } from "@/types/wish-item";

function FolderDetailContent({ folderId }: { folderId: string }) {
  const params = useLocalSearchParams<{ name?: string; owned?: string }>();
  const router = useRouter();
  const [name, setName] = useState(params.name ?? "");
  const [isOldestFirst, setIsOldestFirst] = useState(false);
  const [query, setQuery] = useState("");
  const [wishLevel, setWishLevel] = useState<WishLevelKey | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const showToast = useToast();
  const items = useFolderItems(folderId, isOldestFirst ? "oldest" : "latest", wishLevel, query);
  const counts = useFolderCounts(folderId);
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/folder"));

  useEffect(() => {
    if (items.isError || counts.isError) showToast(TOAST_MESSAGES.SYS_001);
  }, [items.isError, items.errorUpdatedAt, counts.isError, counts.errorUpdatedAt, showToast]);

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
        isRefreshing={items.isRefetching && !items.isFetchingNextPage}
        onRefresh={() => {
          void Promise.all([items.refetch(), counts.refetch()]);
        }}
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
              await renameFolder.mutateAsync({ id: folderId, name: nextName });
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
            deleteFolder.mutate(folderId, {
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

// 비회원 FOLDER 탭의 나의 소장템은 임시 ID("owned")라 로그인 후 실제 폴더 ID로 바꿔 연다.
function FolderDetailEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isPlaceholder = id === "owned";
  const folders = useFolders(isPlaceholder);
  const showToast = useToast();
  useEffect(() => {
    if (isPlaceholder && folders.isError) showToast(TOAST_MESSAGES.SYS_001);
  }, [isPlaceholder, folders.isError, folders.errorUpdatedAt, showToast]);
  if (!isPlaceholder) return <FolderDetailContent folderId={id} />;
  const ownedId = folders.data?.find((folder) => folder.isOwnedItems)?.id;
  if (ownedId) return <FolderDetailContent folderId={ownedId} />;
  if (!folders.isError && !folders.data) return <Spinner />;
  if (folders.isError) {
    return (
      <FolderDetailScreen
        folderName="나의 소장템"
        isOwnedFolder
        isRefreshing={folders.isRefetching}
        onRefresh={() => void folders.refetch()}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/folder"))}
      />
    );
  }
  return (
    <View className="flex-1 bg-gray-0">
      <AppBar
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/folder"))}
      />
      <ErrorState
        message={"폴더를 불러오지 못했습니다.\n잠시 후 다시 시도해주세요."}
        onRetry={() => void folders.refetch()}
      />
    </View>
  );
}

export default function FolderDetailRoute() {
  return (
    <MemberOnly>
      <FolderDetailEntry />
    </MemberOnly>
  );
}
