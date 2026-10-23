import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";

import { useCreateFolder } from "@/hooks/useCreateFolder";
import { useFolders } from "@/hooks/useFolders";
import { useLoginGate } from "@/hooks/useLoginGate";
import { useProductCounts } from "@/hooks/useProductCounts";
import { FolderScreen } from "@/screens/folder/FolderScreen";
import { useDeleteFolder } from "@/screens/folder/mutations/useDeleteFolder";
import { useRenameFolder } from "@/screens/folder/mutations/useRenameFolder";

export default function FolderRoute() {
  const router = useRouter();
  const { requireLogin, loginModal, isGuest } = useLoginGate();
  // 비회원은 조회하지 않고 화면 기본값인 빈 나의 소장템을 보여 준다(ONB-003).
  const folders = useFolders(!isGuest);
  const counts = useProductCounts("", !isGuest);

  // AUTH-001 시안대로 비회원은 FOLDER 탭에 들어오면 로그인 모달을 본다.
  useFocusEffect(
    useCallback(() => {
      if (isGuest) requireLogin(() => undefined);
    }, [isGuest, requireLogin]),
  );
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();

  return (
    <>
      <FolderScreen
        isGuest={isGuest}
        requireLogin={requireLogin}
        isError={!isGuest && folders.isError}
        onRetry={() => void folders.refetch()}
        folders={isGuest ? undefined : (folders.data ?? [])}
        savedItemCount={counts.data?.total ?? 0}
        onNotifications={() => router.push("/notifications")}
        onOpenFolder={(folder) =>
          router.push({
            pathname: "/folder-detail",
            params: { id: folder.id, name: folder.name, owned: folder.isOwnedItems ? "1" : "" },
          })
        }
        onCreateFolder={async (name) => {
          await createFolder.mutateAsync(name);
        }}
        onRenameFolder={async (folder, name) => {
          await renameFolder.mutateAsync({ id: folder.id, name });
        }}
        onDeleteFolder={async (folder) => {
          await deleteFolder.mutateAsync(folder.id);
        }}
      />
      {loginModal}
    </>
  );
}
