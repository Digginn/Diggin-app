import { clsx } from "clsx";
import { useRef, useState } from "react";
import { Keyboard, Linking, Pressable, Text, View } from "react-native";

import KebabSvg from "@/assets/images/icon-kebab.svg";
import { CommentLikeButton } from "@/components/CommentLikeButton";
import { ReportBlockMenu } from "@/components/ReportBlockMenu";
import { colors } from "@/theme";
import { httpLinkParts } from "@/utils/httpLinks";

const KEBAB_SIZE = 16;

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
  likeCount?: number;
  isLiked?: boolean;
  hasLike?: boolean;
  onPressLike?: () => void;
  onPressReply?: () => void;
  /** 댓글 전체의 창 기준 좌표를 같이 넘김. 메뉴를 댓글 세로 가운데에 띄운다(BUG-151). */
  onPressMenu?: (anchor: MenuAnchor) => void;
  onPressReport?: () => void;
  onPressBlock?: () => void;
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
  likeCount = 0,
  isLiked = false,
  hasLike = true,
  onPressLike,
  onPressReply,
  onPressMenu,
  onPressReport,
  onPressBlock,
  onOpenLink,
}: CommentProps) {
  const rootRef = useRef<View>(null);
  const [isReportMenuOpen, setReportMenuOpen] = useState(false);
  const badge = isDeleted ? null : isOperator ? "운영자" : voteChoice?.toUpperCase();

  function handlePressMenu() {
    rootRef.current?.measureInWindow((x, y, width, height) =>
      onPressMenu?.({ x, y, width, height }),
    );
  }

  return (
    <View
      ref={rootRef}
      className={clsx(
        "w-full items-start",
        isHighlighted || isReportMenuOpen || isReply ? "bg-gray-50" : "bg-gray-0",
      )}
    >
      {isReply ? (
        <View className="absolute left-[27px] top-[15px] size-[7.25px] border-b-[1.5px] border-l-[1.5px] border-gray-400" />
      ) : null}
      {isHighlighted ? (
        <View className="absolute bottom-0 left-0 top-0 w-[3px] bg-gray-900" />
      ) : null}
      <View
        className={clsx(
          "h-12 w-full flex-row items-center justify-between pr-3",
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
                  "shrink-0 items-center justify-center rounded-sm px-1.5",
                  // BUG-143 높이 20 라벨에 위아래 여백까지 주면 글자가 아래로 밀린다(공지 상세 라벨과 같게).
                  badge === "NOT" ? "bg-gray-vote-not py-0.5" : "h-5 bg-gray-800",
                )}
              >
                <Text
                  className={clsx(
                    "font-label-12-semibold",
                    badge === "NOT" ? "text-gray-800" : "text-gray-0",
                  )}
                >
                  {badge}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View className="size-12 flex-row items-center justify-end">
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
        <View className="w-full items-start pb-1">
          <Text
            onPress={!isDeleted && onPressMenu ? handlePressMenu : undefined}
            className={clsx("w-full font-b3", isDeleted ? "text-gray-500" : "text-gray-800")}
          >
            {isDeleted ? "삭제된 댓글입니다." : renderBody(body, onOpenLink)}
          </Text>
        </View>
      </View>
      <View className={clsx("h-12 w-full pr-margin", isReply ? "pl-10" : "pl-margin")}>
        {/* BUG-144 구분선을 댓글 맨 아래에 붙여 다음 답글 배경이 구분선에서 바로 시작하게 한다. */}
        <View className="h-12 justify-center border-b border-gray-200">
          <Text className="text-gray-500 font-label-12-regular">{timeLabel}</Text>
        </View>
        {!isDeleted && (
          <View className="absolute right-3 top-0 h-12 flex-row items-center">
            {hasLike && (
              <CommentLikeButton isLiked={isLiked} likeCount={likeCount} onPress={onPressLike} />
            )}
            {/* 답글에는 다시 답글을 달 수 없다. */}
            {!isReply && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="댓글 답글"
                accessibilityState={{ disabled: !onPressReply }}
                disabled={!onPressReply}
                className="size-12 items-center justify-center active:opacity-75"
                onPress={onPressReply}
              >
                <Text className="text-gray-600 font-label-12-regular">답글</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
