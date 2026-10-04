import { Text, View } from "react-native";

import EmptyAll from "@/assets/images/empty-all.svg";
import EmptyPost from "@/assets/images/empty-post.svg";
import EmptyVote from "@/assets/images/empty-vote.svg";

const IMAGE_SIZE = 96;

const IMAGES = {
  all: EmptyAll,
  post: EmptyPost,
  vote: EmptyVote,
} as const;

type EmptyStateProps = {
  message: string;
  variant?: keyof typeof IMAGES;
};

export function EmptyState({ message, variant = "all" }: EmptyStateProps) {
  const Image = IMAGES[variant];

  return (
    <View className="flex-1 items-center justify-center gap-2">
      <Image width={IMAGE_SIZE} height={IMAGE_SIZE} />
      <Text className="text-center text-gray-500 font-b1">{message}</Text>
    </View>
  );
}
