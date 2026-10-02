import { clsx } from "clsx";
import { Image, type ImageSource } from "expo-image";
import { cssInterop } from "nativewind";
import { useState } from "react";
import { View } from "react-native";

import OpenFolderSmall from "@/assets/images/folder/image-open-folder-small.svg";
import OpenFolder from "@/assets/images/folder/image-open-folder.svg";
import { FallbackImg } from "@/components/FallbackImg";

const StyledImage = cssInterop(Image, { className: "style" });

export type FolderThumbnailSource = ImageSource | number | string;

type FolderPreviewProps = {
  itemCount: number;
  thumbnails?: FolderThumbnailSource[];
  isCompact: boolean;
};

function Thumbnail({ source }: { source?: FolderThumbnailSource }) {
  const [failedSource, setFailedSource] = useState<FolderThumbnailSource>();
  return source && source !== failedSource ? (
    <StyledImage
      source={source}
      contentFit="cover"
      className="h-full w-full"
      onError={() => setFailedSource(source)}
    />
  ) : (
    <FallbackImg className="h-full" />
  );
}

export function FolderPreview({ itemCount, thumbnails = [], isCompact }: FolderPreviewProps) {
  const visibleCount = Math.min(itemCount, 3);
  return (
    <View
      pointerEvents="none"
      className={clsx("relative", isCompact ? "h-[68px] w-[100px]" : "h-[104px] w-[150px]")}
    >
      {visibleCount >= 2 && (
        <>
          <View
            className={clsx(
              "absolute overflow-hidden",
              isCompact
                ? "left-[43.25px] top-[7.1px] size-[51px] rotate-[14.7deg] rounded-[4.09px]"
                : "left-[65.46px] top-[11.87px] size-[76px] rotate-[15deg] rounded-[6.135px]",
            )}
          >
            <Thumbnail source={thumbnails[visibleCount === 3 ? 2 : 1]} />
            <View className="absolute inset-0 bg-black/[0.08]" />
          </View>
          <View
            className={clsx(
              "absolute overflow-hidden",
              isCompact
                ? "left-[5.77px] top-[7.1px] size-[51px] -rotate-[14.7deg] rounded-[4.09px]"
                : "left-[8.54px] top-[11.87px] size-[76px] -rotate-[15deg] rounded-[6.135px]",
            )}
          >
            <Thumbnail source={thumbnails[visibleCount === 3 ? 1 : 0]} />
            {visibleCount === 3 && <View className="absolute inset-0 bg-black/[0.08]" />}
          </View>
        </>
      )}
      {(visibleCount === 1 || visibleCount === 3) && (
        <View
          className={clsx(
            "absolute overflow-hidden",
            isCompact
              ? "left-6 top-0 h-[50.26px] w-[51px] rounded-[4.09px] shadow-[0_2.667px_2.667px_rgba(0,0,0,0.04)]"
              : "left-9 top-0 size-[76px] rounded-[6.135px] shadow-[0_4px_4px_rgba(0,0,0,0.04)]",
          )}
        >
          <Thumbnail source={thumbnails[0]} />
        </View>
      )}
      <View
        className={clsx(
          "absolute",
          isCompact ? "left-[7.6px] top-[25.44px]" : "left-[10.89px] top-[39.73px]",
        )}
      >
        {isCompact ? <OpenFolderSmall /> : <OpenFolder />}
      </View>
    </View>
  );
}
