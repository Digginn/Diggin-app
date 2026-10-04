import { clsx } from "clsx";
import { Image } from "expo-image";
import { cssInterop } from "nativewind";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import CommentSvg from "@/assets/images/icon-comment.svg";
import HeartSvg from "@/assets/images/icon-heart.svg";
import ReportSvg from "@/assets/images/icon-report.svg";
import { ProductImg } from "@/components/ProductImg";
import { colors } from "@/theme";

const StyledImage = cssInterop(Image, { className: "style" });

// 아이콘 에셋이 24 프레임 기준이라 쓰는 크기에 맞춰 같은 비율로 줄임
const SCALE = 16 / 24;
const HEART = { width: 18 * SCALE, height: 16.35 * SCALE };
const COMMENT = { width: 19.5 * SCALE, height: 16.93 * SCALE };

const COLUMN_COUNT = 2;

export type PostType = "all" | "vote";

export type PostItem = {
  id: string;
  imageUrl?: string | null;
};

type PostProps = {
  type?: PostType;
  body: string;
  items: PostItem[];
  timeLabel: string;
  authorLabel: string;
  likeCount?: number;
  commentCount: number;
  onPress?: () => void;
  onPressReport?: () => void;
  onPressItemInfo?: (item: PostItem) => void;
};

function Meta({ children }: { children: ReactNode }) {
  return <Text className="text-right text-gray-500 font-b3">{children}</Text>;
}

function toRows(items: PostItem[]): (PostItem | null)[][] {
  const rows: (PostItem | null)[][] = [];
  for (let index = 0; index < items.length; index += COLUMN_COUNT) {
    const row: (PostItem | null)[] = items.slice(index, index + COLUMN_COUNT);
    while (row.length < COLUMN_COUNT) row.push(null);
    rows.push(row);
  }
  return rows;
}

export function Post({
  type = "all",
  body,
  items,
  timeLabel,
  authorLabel,
  likeCount,
  commentCount,
  onPress,
  onPressReport,
  onPressItemInfo,
}: PostProps) {
  const isVote = type === "vote";

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      className={clsx(
        "w-full border-b border-gray-200 bg-gray-0 px-margin pt-4",
        isVote ? "items-start pb-1" : "items-center justify-center pb-1.5",
        onPress && "active:opacity-75",
      )}
      disabled={!onPress}
      onPress={onPress}
    >
      <View className={clsx("w-full items-start", isVote && "h-[120px]")}>
        {isVote ? (
          <View className="w-full flex-row items-start gap-3">
            <View className="min-w-0 flex-1 self-stretch">
              <Text className="h-[39px] w-full text-gray-1000 font-b4" numberOfLines={2}>
                {body}
              </Text>
            </View>
            <StyledImage
              className="size-20 rounded bg-gray-100"
              contentFit="cover"
              source={items[0]?.imageUrl ?? undefined}
            />
          </View>
        ) : (
          <View className="w-full gap-4">
            <Text className="w-full text-gray-1000 font-b4" numberOfLines={1}>
              {body}
            </Text>
            <View className="w-full gap-2">
              {toRows(items).map((row, rowIndex) => (
                <View key={rowIndex} className="flex-row gap-2">
                  {row.map((item, columnIndex) =>
                    item ? (
                      <ProductImg
                        key={item.id}
                        className="flex-1"
                        url={item.imageUrl}
                        onPressInfo={onPressItemInfo ? () => onPressItemInfo(item) : undefined}
                      />
                    ) : (
                      <View key={`empty-${columnIndex}`} className="flex-1" />
                    ),
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        <View className="w-full flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Meta>{timeLabel}</Meta>
            <Text className="text-gray-500 font-b1">·</Text>
            <Meta>{authorLabel}</Meta>
            <Text className="text-gray-500 font-b1">·</Text>
            <View className="flex-row items-center justify-end gap-2">
              {likeCount !== undefined ? (
                <View className="flex-row items-center justify-center gap-1">
                  <HeartSvg {...HEART} color={colors.gray[500]} />
                  <Meta>{likeCount}</Meta>
                </View>
              ) : null}
              <View className="flex-row items-center justify-center gap-1">
                <CommentSvg {...COMMENT} color={colors.gray[500]} />
                <Meta>{commentCount}</Meta>
              </View>
            </View>
          </View>
          <Pressable
            accessibilityLabel="신고하기"
            accessibilityRole="button"
            className="size-12 flex-row items-center justify-end active:opacity-75"
            onPress={onPressReport}
          >
            <ReportSvg width={18} height={18} color={colors.gray[400]} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
