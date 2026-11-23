import { clsx } from "clsx";
import { useRef, useState } from "react";
import { Keyboard, Linking, Pressable, Text, View } from "react-native";

import HeartFilledSvg from "@/assets/images/icon-comment-heart-filled.svg";
import HeartSvg from "@/assets/images/icon-comment-heart.svg";
import KebabSvg from "@/assets/images/icon-kebab.svg";
import { ReportBlockMenu } from "@/components/ReportBlockMenu";
import { colors } from "@/theme";
import { httpLinkParts } from "@/utils/httpLinks";

const KEBAB_SIZE = 16;
const HEART_SIZE = 16;

export type MenuAnchor = { x: number; y: number; width: number; height: number };

type CommentProps = {
  /** 계정 닉네임과 본인·글쓴이 구분 라벨 */
  author: string;
  body: string;
  timeLabel: string;
  /** 서버에서 확인한 활성 관리자 여부 */
  isOperator?: boolean;
  voteChoice?: "buy" | "not" | null;
  isHighlighted?: boolean;
  /** 원 댓글 아래 들여쓴 답글(CommentReply) */
  isReply?: boolean;
  /** 삭제된 댓글은 본문을 대체하고 메뉴를 막음 */
  isDeleted?: boolean;
  /** 케밥의 창 기준 좌표를 같이 넘김 */
  onPressMenu?: (anchor: MenuAnchor) => void;
  onPressReport?: () => void;
  onPressBlock?: () => void;
  /** 답글 버튼은 원 댓글에만 넘김 */
  onPressReply?: () => void;
  likeCount?: number;
  isLiked?: boolean;
  /** 본인·탈퇴 댓글에는 넘기지 않아 하트를 숨김(LIKE-004) */
  onPressLike?: () => void;
  onOpenLink?: (url: string) => void;
};

function renderBody(body: string, onOpenLink?: (url: string) => void) {
  return httpLinkParts(body).map((part, index) =>
    part.url ? (
      <Text
        key={index}
        className="text-semantic-link underline"
        onPress={(event) => {
          event.stopPropagation();
          if (onOpenLink) onOpenLink(part.url!);
          else void Linking.openURL(part.url!).catch(() => {});
        }}
      >
        {part.text}
      </Text>
    ) : (
      part.text
    ),
  );
}

export function Comment({
  author,
  body,
  timeLabel,
  isOperator = false,
  voteChoice = null,
  isHighlighted = false,
  isReply = false,
  isDeleted = false,
  onPressMenu,
  onPressReport,
  onPressBlock,
  onPressReply,
  likeCount = 0,
  isLiked = false,
  onPressLike,
  onOpenLink,
}: CommentProps) {
  const kebabRef = useRef<View>(null);
  const [isReportMenuOpen, setReportMenuOpen] = useState(false);
  const badge = isDeleted ? null : isOperator ? "운영자" : voteChoice?.toUpperCase();

  function handlePressMenu() {
    kebabRef.current?.measureInWindow((x, y, width, height) =>
      onPressMenu?.({ x, y, width, height }),
    );
  }

  return (
    <View
      className={clsx(
        "w-full items-start pt-0.5",
        isHighlighted || isReportMenuOpen || isReply ? "bg-gray-50" : "bg-gray-0",
      )}
    >
      {isReply ? (
        <View className="absolute left-[27px] top-[17px] size-[7.25px] border-b-[1.5px] border-l-[1.5px] border-gray-400" />
      ) : null}
      {isHighlighted ? (
        <View className="absolute bottom-0 left-0 top-0 w-[3px] bg-gray-900" />
      ) : null}
      <View
        className={clsx(
          "w-full flex-row items-center justify-between pr-2",
          isReply ? "pl-10" : "pl-margin",
        )}
      >
        <View className="min-w-0 flex-1 flex-row items-center gap-1">
          <View className="min-w-0 shrink flex-row items-center gap-1.5">
            <Text
              numberOfLines={1}
              className={clsx(
                "min-w-0 shrink font-label-14",
                isOperator && !isDeleted ? "text-gray-800" : "text-gray-600",
              )}
            >
              {author}
            </Text>
            {badge ? (
              <View
                className={clsx(
                  "shrink-0 items-center justify-center rounded-sm px-1.5 py-0.5",
                  badge === "NOT" ? "bg-gray-vote-not" : "h-5 bg-gray-800",
                )}
              >
                <Text
                  className={clsx(
                    "font-label-12-semibold",
                    badge === "NOT" ? "text-gray-800" : "text-gray-0",
                    isOperator && "!leading-[18px]",
                  )}
                >
                  {badge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-gray-500 font-label-12-regular">·</Text>
          <Text className="text-gray-500 font-label-12-regular">{timeLabel}</Text>
        </View>
        {/* 케밥(48)이 이 줄의 높이를 만든다. 삭제된 댓글이라 숨겨도 높이는 유지한다. */}
        <View className="h-12 shrink-0 flex-row items-center justify-end">
          {!isDeleted && onPressReply && (
            <Pressable
              accessibilityLabel="답글 달기"
              accessibilityRole="button"
              className="h-12 items-center justify-center px-3 active:opacity-75"
              onPress={onPressReply}
            >
              <Text className="text-gray-600 font-label-12-regular">답글</Text>
            </Pressable>
          )}
          {!isDeleted && onPressLike && (
            <View className="w-9 flex-row items-center">
              <Pressable
                accessibilityLabel={`좋아요 ${likeCount}개`}
                accessibilityRole="button"
                accessibilityState={{ selected: isLiked }}
                className="h-12 flex-row items-center gap-0.5 p-2.5 active:opacity-75"
                onPress={onPressLike}
              >
                {isLiked ? (
                  <HeartFilledSvg
                    width={HEART_SIZE}
                    height={HEART_SIZE}
                    color={colors.semantic.error}
                  />
                ) : (
                  <HeartSvg width={HEART_SIZE} height={HEART_SIZE} color={colors.gray[500]} />
                )}
                <Text className="text-gray-500 font-label-12-semibold">{likeCount}</Text>
              </Pressable>
            </View>
          )}
          {!isDeleted && onPressReport && onPressBlock && (
            <ReportBlockMenu
              placement="comment"
              onReport={onPressReport}
              onBlock={onPressBlock}
              onOpenChange={(isOpen) => {
                if (isOpen) Keyboard.dismiss();
                setReportMenuOpen(isOpen);
              }}
            />
          )}
          {isDeleted || !onPressMenu ? null : (
            <Pressable
              ref={kebabRef}
              accessibilityLabel="댓글 메뉴"
              accessibilityRole="button"
              className="size-12 items-center justify-center active:opacity-75"
              onPress={handlePressMenu}
            >
              <KebabSvg width={KEBAB_SIZE} height={KEBAB_SIZE} color={colors.gray[500]} />
            </Pressable>
          )}
        </View>
      </View>

      <View className={clsx("w-full items-start pr-margin", isReply ? "pl-10" : "pl-margin")}>
        <View className="w-full items-start border-b border-gray-200 pb-4">
          <Text
            onPress={!isDeleted && onPressMenu ? handlePressMenu : undefined}
            className={clsx("w-full font-b3", isDeleted ? "text-gray-500" : "text-gray-800")}
          >
            {isDeleted ? "삭제된 댓글입니다." : renderBody(body, onOpenLink)}
          </Text>
        </View>
      </View>
    </View>
  );
}
