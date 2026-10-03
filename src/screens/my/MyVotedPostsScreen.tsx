import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "@/components/app-bar";

import { VoteListItem, type VoteListItemData } from "./components/VoteListItem";

type MyVotedPostsScreenProps = {
  votes: VoteListItemData[];
  onPressVote?: (id: string) => void;
  onReportVote: (id: string) => void;
};

export function MyVotedPostsScreen({ votes, onPressVote, onReportVote }: MyVotedPostsScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar title="내가 투표한 글" />
      <FlatList
        data={votes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <VoteListItem
            item={item}
            onPress={onPressVote ? () => onPressVote(item.id) : undefined}
            onReport={() => onReportVote(item.id)}
          />
        )}
        ItemSeparatorComponent={() => <View className="h-px" />}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
