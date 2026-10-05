import { clsx } from "clsx";
import { Pressable, Text, View } from "react-native";

import type { VoteChoice, VotePost } from "@/types/post";

type VoteBlockProps = {
  vote: VotePost;
  onChoose: (choice: VoteChoice) => void;
  isMyVote?: boolean;
};

const CHOICES: VoteChoice[] = ["BUY", "NOT"];

export function VoteBlock({ vote, onChoose, isMyVote = false }: VoteBlockProps) {
  const total = vote.buyCount + vote.notCount;
  const hasResults = isMyVote || vote.myChoice !== null || vote.isClosed;

  return (
    <View className="w-full gap-2.5 px-margin pb-1 pt-4">
      <View className="flex-row items-start justify-between">
        <Text className="text-gray-700 font-label-14">
          {vote.isClosed
            ? "투표가 종료되었습니다."
            : hasResults
              ? `총 ${total}명 참여`
              : "살까, 말까? 투표해 주세요."}
        </Text>
        <Text className="text-gray-500 font-note">
          {vote.isClosed ? `총 ${total}명 참여` : vote.remainingLabel}
        </Text>
      </View>
      {hasResults ? (
        CHOICES.map((choice) => {
          const count = choice === "BUY" ? vote.buyCount : vote.notCount;
          const otherCount = choice === "BUY" ? vote.notCount : vote.buyCount;
          const isLeading = count > otherCount;
          const isDisabled = vote.isClosed || (!isMyVote && vote.myChoice === choice);
          return (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityLabel={`${choice} ${count}명`}
              accessibilityState={{
                selected: !isMyVote && vote.myChoice === choice,
                disabled: isDisabled,
              }}
              disabled={isDisabled}
              onPress={() => onChoose(choice)}
              className="h-12 w-full overflow-hidden rounded-lg bg-gray-100"
            >
              <View
                className={clsx(
                  "absolute bottom-0 left-0 top-0",
                  isLeading ? "bg-gray-900" : "bg-gray-300",
                )}
                style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
              >
                {isLeading ? (
                  <Text className="absolute right-4 top-3 text-gray-0 font-label-16-semibold">
                    {count}명
                  </Text>
                ) : null}
              </View>
              <View className="absolute bottom-0 left-4 top-0 flex-row items-center gap-1.5">
                <Text
                  className={clsx(
                    "font-label-16-bold",
                    isLeading ? "text-gray-0" : "text-gray-900",
                  )}
                >
                  {choice}
                </Text>
                {!isMyVote && vote.myChoice === choice ? (
                  <Text
                    className={clsx(
                      "font-label-12-semibold",
                      isLeading ? "text-gray-0" : "text-gray-900",
                    )}
                  >
                    ✓ 내 선택
                  </Text>
                ) : null}
              </View>
              {!isLeading ? (
                <Text className="absolute right-6 top-3 text-gray-900 font-label-16-semibold">
                  {count}명
                </Text>
              ) : null}
            </Pressable>
          );
        })
      ) : (
        <View className="flex-row gap-3">
          {CHOICES.map((choice) => (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityLabel={choice}
              className="h-12 flex-1 items-center justify-center rounded bg-gray-100 active:opacity-75"
              onPress={() => onChoose(choice)}
            >
              <Text className="text-gray-900 font-label-16-semibold">{choice}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {!isMyVote ? (
        <Text className="text-gray-500 font-note">
          {vote.isClosed
            ? "종료된 투표는 결과만 확인할 수 있어요."
            : hasResults
              ? "투표 종료 전까지 다른 선택지를 눌러 다시 투표할 수 있어요."
              : "투표하면 지금까지의 결과를 볼 수 있어요."}
        </Text>
      ) : null}
    </View>
  );
}
