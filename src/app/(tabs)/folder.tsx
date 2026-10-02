import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import type { FolderItem } from "@/screens/folder/components/FolderCard";
import { FolderScreen } from "@/screens/folder/FolderScreen";

// 폴더 목록과 아이템 1·2·3개 미리보기 확인용 데이터입니다. 실제 조회 데이터가 아닙니다.
const PREVIEW_FOLDERS: FolderItem[] = [
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `preview-${index}`,
    name: "폴더명",
    itemCount: index < 3 ? index + 1 : 0,
    thumbnails: Array.from({ length: index < 3 ? index + 1 : 0 }, () =>
      require("@/assets/images/folder/image-folder-item-preview.png"),
    ),
  })),
  { id: "default", name: "기본 폴더", itemCount: 0 },
  { id: "owned", name: "나의 소장템", itemCount: 0, isOwnedItems: true },
];

export default function FolderRoute() {
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const router = useRouter();
  const [createdFolders, setCreatedFolders] = useState<FolderItem[]>([]);
  const [renamedFolders, setRenamedFolders] = useState<Record<string, string>>({});
  const [deletedFolderIds, setDeletedFolderIds] = useState<string[]>([]);
  // UI 퍼블리싱 확인용입니다. 운영 앱에서는 미리보기 상태를 적용하지 않습니다.
  const isErrorPreview = __DEV__ && preview === "error";
  let folders: FolderItem[] | undefined;
  if (__DEV__) {
    folders =
      preview === "empty" ? [] : preview === "basic" ? PREVIEW_FOLDERS.slice(-2) : PREVIEW_FOLDERS;
    if (preview === "menu" || preview === "six" || preview === "seven") {
      folders = [
        ...PREVIEW_FOLDERS.slice(0, preview === "menu" ? 2 : preview === "six" ? 4 : 5),
        ...PREVIEW_FOLDERS.slice(-2),
      ];
    }
    if (preview === "items" || preview === "items-compact") {
      folders = [
        ...[0, 1, 2, 3].map((itemCount) => ({
          id: `items-${itemCount}`,
          name: `${itemCount}개 미리보기`,
          itemCount,
          thumbnails: Array.from({ length: Math.min(itemCount, 3) }, () =>
            require("@/assets/images/folder/image-folder-item-preview.png"),
          ),
        })),
        { id: "owned", name: "나의 소장템", itemCount: 3, isOwnedItems: true },
        { id: "fallback", name: "이미지 없음", itemCount: 2 },
        ...(preview === "items-compact" ? [{ id: "extra", name: "추가 폴더", itemCount: 5 }] : []),
      ];
    }
  }

  return (
    <FolderScreen
      onOpenFolder={(folder) =>
        router.push({
          pathname: "/folder-detail",
          params: {
            id: folder.id,
            name: folder.name,
            ...(__DEV__ && preview === "detail-error" ? { preview: "error" } : {}),
          },
        })
      }
      isError={isErrorPreview}
      folders={
        folders
          ? [...folders, ...createdFolders]
              .filter((folder) => !deletedFolderIds.includes(folder.id))
              .map((folder) => ({
                ...folder,
                name: renamedFolders[folder.id] ?? folder.name,
              }))
          : undefined
      }
      onDeleteFolder={
        __DEV__
          ? (folder) => {
              if (preview === "delete-error") throw new Error("삭제 실패 미리보기");
              setDeletedFolderIds((previous) => [...previous, folder.id]);
            }
          : undefined
      }
      onRenameFolder={
        __DEV__
          ? (folder, name) => {
              if (preview === "rename-error") throw new Error("이름 수정 실패 미리보기");
              setRenamedFolders((previous) => ({ ...previous, [folder.id]: name }));
            }
          : undefined
      }
      onCreateFolder={
        __DEV__
          ? (name) => {
              if (preview === "create-error") throw new Error("생성 실패 미리보기");
              setCreatedFolders((previous) => [
                ...previous,
                { id: `created-${Date.now()}`, name, itemCount: 0, createdAt: Date.now() },
              ]);
            }
          : undefined
      }
      onRetry={isErrorPreview ? () => router.setParams({ preview: undefined }) : undefined}
    />
  );
}
