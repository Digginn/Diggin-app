import { clsx } from "clsx";
import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { useRef, type RefObject } from "react";
import { Pressable, Text, View } from "react-native";

import MoreIcon from "@/assets/images/folder/icon-folder-more.svg";
import OwnedItemsSmallIcon from "@/assets/images/folder/icon-owned-items-small.svg";
import OwnedItemsIcon from "@/assets/images/folder/icon-owned-items.svg";

import type { FolderMenuAnchor } from "./FolderMenu";
import { FolderPreview, type FolderThumbnailSource } from "./FolderPreview";

const StyledImage = cssInterop(Image, { className: "style" });

export type FolderItem = {
  id: string;
  name: string;
  itemCount: number;
  createdAt?: number;
  lastItemAddedAt?: number;
  isOwnedItems?: boolean;
  thumbnails?: FolderThumbnailSource[];
};

type FolderCardProps = {
  folder: FolderItem;
  columnCount?: 2 | 3;
  onPress?: () => void;
  onPressMenu?: (anchor: FolderMenuAnchor) => void;
  guideRef?: RefObject<View | null>;
  isGuidePreview?: boolean;
};

export function FolderCard({
  folder,
  columnCount = 2,
  onPress,
  onPressMenu,
  guideRef,
  isGuidePreview = false,
}: FolderCardProps) {
  const cardRef = useRef<View>(null);
  const isCompact = columnCount === 3;
  const canManage = folder.id !== "default" && !folder.isOwnedItems && !!onPressMenu;
  function openMenu() {
    if (!canManage) return;
    cardRef.current?.measureInWindow((x, y, width, height) =>
      onPressMenu?.({ x, y, width, height }),
    );
  }
  return (
    <Pressable
      ref={(view) => {
        cardRef.current = view;
        if (guideRef) guideRef.current = view;
      }}
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}, ${folder.itemCount}개의 아이템`}
      accessibilityState={{ disabled: !onPress && !canManage }}
      disabled={!onPress && !canManage}
      onPress={onPress}
      onLongPress={canManage ? openMenu : undefined}
      className={clsx(
        "flex-1 active:opacity-75",
        isCompact ? "gap-gutter pt-6" : "gap-2 pt-[22px]",
      )}
    >
      <View className={clsx("items-center justify-end", isCompact ? "h-[68px]" : "h-[104px]")}>
        {folder.itemCount > 0 && !folder.isOwnedItems ? (
          <FolderPreview
            itemCount={folder.itemCount}
            thumbnails={folder.thumbnails}
            isCompact={isCompact}
          />
        ) : (
          <StyledImage
            source={
              isCompact
                ? require("@/assets/images/folder/image-closed-folder-small.png")
                : require("@/assets/images/folder/image-closed-folder.png")
            }
            contentFit="contain"
            className={isCompact ? "h-[56px] w-[74px] -translate-x-px" : "h-[85px] w-[112px]"}
          />
        )}
        {folder.isOwnedItems && (
          <View
            className={clsx(
              "absolute items-center",
              isCompact ? "top-7 -translate-x-px" : "top-[44px]",
            )}
          >
            {isCompact ? <OwnedItemsSmallIcon /> : <OwnedItemsIcon />}
          </View>
        )}
      </View>
      <View className={clsx("gap-0.5", isCompact ? "pl-3" : "pl-5")}>
        <Text numberOfLines={1} className="text-gray-900 font-nickname">
          {folder.name}
        </Text>
        <Text className="text-gray-500 font-name-s">{folder.itemCount}개의 아이템</Text>
      </View>
      {canManage && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${folder.name} 관리 메뉴`}
          className={clsx(
            "absolute right-0 items-center justify-center active:opacity-75",
            isCompact ? "top-1 size-8" : "-top-[7px] size-12",
          )}
          onPress={(event) => {
            event.stopPropagation();
            openMenu();
          }}
        >
          <MoreIcon />
        </Pressable>
      )}
      {isGuidePreview && !canManage && (
        <View
          pointerEvents="none"
          accessible={false}
          className={clsx(
            "absolute right-0 items-center justify-center",
            isCompact ? "top-1 size-8" : "-top-[7px] size-12",
          )}
        >
          <MoreIcon />
        </View>
      )}
    </Pressable>
  );
}
