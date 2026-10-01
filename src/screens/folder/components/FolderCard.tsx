import { clsx } from "clsx";
import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";

import OwnedItemsSmallIcon from "@/assets/images/folder/icon-owned-items-small.svg";
import OwnedItemsIcon from "@/assets/images/folder/icon-owned-items.svg";

import type { FolderMenuAnchor } from "./FolderMenu";

const StyledImage = cssInterop(Image, { className: "style" });

export type FolderItem = {
  id: string;
  name: string;
  itemCount: number;
  createdAt?: number;
  isOwnedItems?: boolean;
};

type FolderCardProps = {
  folder: FolderItem;
  columnCount?: 2 | 3;
  onPress?: () => void;
  onPressMenu?: (anchor: FolderMenuAnchor) => void;
};

export function FolderCard({ folder, columnCount = 2, onPress, onPressMenu }: FolderCardProps) {
  const cardRef = useRef<View>(null);
  const isCompact = columnCount === 3;
  return (
    <Pressable
      ref={cardRef}
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}, ${folder.itemCount}개의 아이템`}
      accessibilityState={{ disabled: !onPress && !onPressMenu }}
      disabled={!onPress && !onPressMenu}
      onPress={
        onPress ??
        (onPressMenu
          ? () =>
              cardRef.current?.measureInWindow((x, y, width, height) =>
                onPressMenu({ x, y, width, height }),
              )
          : onPress)
      }
      onLongPress={
        onPressMenu
          ? () =>
              cardRef.current?.measureInWindow((x, y, width, height) =>
                onPressMenu({ x, y, width, height }),
              )
          : undefined
      }
      className="flex-1 gap-gutter active:opacity-75"
    >
      <View className={clsx("items-center justify-end", isCompact ? "h-[68px]" : "h-[104px]")}>
        <StyledImage
          source={
            isCompact
              ? require("@/assets/images/folder/image-closed-folder-small.png")
              : require("@/assets/images/folder/image-closed-folder.png")
          }
          contentFit="contain"
          className={isCompact ? "h-[56px] w-[74px] -translate-x-px" : "h-[85px] w-[112px]"}
        />
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
    </Pressable>
  );
}
