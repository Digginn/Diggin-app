import { useRouter } from "expo-router";

import { useCreateFolder } from "@/hooks/useCreateFolder";
import { useFolders } from "@/hooks/useFolders";
import { useProductCounts } from "@/hooks/useProductCounts";
import { FolderScreen } from "@/screens/folder/FolderScreen";
import { useDeleteFolder } from "@/screens/folder/mutations/useDeleteFolder";
import { useRenameFolder } from "@/screens/folder/mutations/useRenameFolder";

export default function FolderRoute() {
  const router = useRouter();
  const folders = useFolders();
  const counts = useProductCounts();
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();

  return (
    <FolderScreen
      isError={folders.isError}
      onRetry={() => void folders.refetch()}
      folders={folders.data ?? []}
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
  );
}
