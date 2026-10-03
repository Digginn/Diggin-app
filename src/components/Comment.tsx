import { clsx } from "clsx";
import { useRef } from "react";
import { Linking, Pressable, Text, View } from "react-native";

import KebabSvg from "@/assets/images/icon-kebab.svg";
import { colors } from "@/theme";

const KEBAB_SIZE = 16;
// g 플래그가 붙으면 test 가 lastIndex 를 기억해서 쪼개기용과 판별용을 나눠 둠
const URL_SPLIT = /(https?:\/\/[^\s]+)/g;
const IS_URL = /^https?:\/\//;

export type CommentVote = "none" | "buy" | "not";
export type MenuAnchor = { x: number; y: number; width: number; height: number };

const BADGE_LABELS: Record<Exclude<CommentVote, "none">, string> = {
  buy: "BUY",
  not: "NOT",
};

type CommentProps = {
  /** 글쓴이는 익명번호를 세지 않음. 익1 - 글쓴이 - 익2 */
  author: string;
  body: string;
  timeLabel: string;
  vote?: CommentVote;
  isHighlighted?: boolean;
  /** 삭제된 댓글은 본문을 대체하고 메뉴를 막음 */
  isDeleted?: boolean;
  /** 케밥의 창 기준 좌표를 같이 넘김 */
  onPressMenu?: (anchor: MenuAnchor) => void;
};

function renderBody(body: string) {
  return body.split(URL_SPLIT).map((part, index) =>
    IS_URL.test(part) ? (
      <Text
        key={index}
        className="text-semantic-link underline"
        onPress={() => Linking.openURL(part)}
      >
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

export function Comment({
  author,
  body,
  timeLabel,
  vote = "none",
  isHighlighted = false,
  isDeleted = false,
  onPressMenu,
}: CommentProps) {
  const badge = vote === "none" ? null : vote;
  const kebabRef = useRef<View>(null);

  function handlePressMenu() {
    kebabRef.current?.measureInWindow((x, y, width, height) =>
      onPressMenu?.({ x, y, width, height }),
    );
  }

  return (
    <View className={clsx("w-full items-start pt-0.5", isHighlighted ? "bg-gray-50" : "bg-gray-0")}>
      {isHighlighted ? (
        <View className="absolute bottom-0 left-0 top-0 w-[3px] bg-gray-900" />
      ) : null}
      <View className="w-full flex-row items-center justify-between pl-margin pr-2">
        <View className="flex-row items-center gap-1">
          <Text className="text-gray-600 font-label-14">{author}</Text>
          {badge ? (
            <View
              className={clsx(
                "items-center overflow-hidden rounded px-1.5 py-0.5",
                badge === "buy" ? "bg-gray-900" : "bg-gray-200",
              )}
            >
              <Text className={clsx("font-tag", badge === "buy" ? "text-gray-0" : "text-gray-800")}>
                {BADGE_LABELS[badge]}
              </Text>
            </View>
          ) : null}
          <Text className="text-gray-500 font-label-12-regular">·</Text>
          <Text className="text-gray-500 font-label-12-regular">{timeLabel}</Text>
        </View>
        {/* 케밥(48)이 이 줄의 높이를 만든다. 삭제된 댓글이라 숨겨도 높이는 유지한다. */}
        <View className="h-12 w-[120px] flex-row items-center justify-end gap-1.5">
          {isDeleted ? null : (
            <Pressable
              ref={kebabRef}
              accessibilityLabel="댓글 메뉴"
              accessibilityRole="button"
              className="size-12 items-center justify-center active:opacity-75"
              onPress={handlePressMenu}
            >
              <KebabSvg width={KEBAB_SIZE} height={KEBAB_SIZE} color={colors.gray[900]} />
            </Pressable>
          )}
        </View>
      </View>

      <View className="w-full items-start px-margin">
        <View className="w-full items-start border-b border-gray-200 pb-4">
          <Text className={clsx("w-full font-b3", isDeleted ? "text-gray-500" : "text-gray-800")}>
            {isDeleted ? "삭제된 댓글입니다." : renderBody(body)}
          </Text>
        </View>
      </View>
    </View>
  );
}
