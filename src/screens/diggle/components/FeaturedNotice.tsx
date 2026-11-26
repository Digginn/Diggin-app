import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useLoginGate } from "@/hooks/useLoginGate";
import { supabase } from "@/lib/supabase";

import { communityKeys } from "../api/community";

export function FeaturedNotice() {
  const router = useRouter();
  const { session, isRestoring } = useAuth();
  const { requireLogin, loginModal } = useLoginGate();
  const result = useQuery({
    queryKey: [...communityKeys.all, "featured-notice", session?.user.id ?? null],
    enabled: !isRestoring,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_featured_notice");
      if (error) throw error;
      if (data === null) return null;
      if (
        typeof data !== "object" ||
        Array.isArray(data) ||
        typeof data.id !== "string" ||
        typeof data.title !== "string"
      )
        throw new Error("invalid_notice_response");
      return { id: data.id, title: data.title };
    },
  });
  const { refetch } = result;
  useFocusEffect(
    useCallback(() => {
      if (!isRestoring) void refetch();
    }, [isRestoring, refetch]),
  );
  if (!result.data || result.isError) return null;
  const notice = result.data;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`공지: ${notice.title}`}
        className="flex-row items-center gap-2 border-b border-gray-200 bg-gray-50 px-margin py-3.5"
        onPress={() =>
          requireLogin(() => router.push({ pathname: "/notices/[id]", params: { id: notice.id } }))
        }
      >
        <View className="h-5 justify-center rounded-sm bg-gray-800 px-1.5">
          <Text className="text-gray-0 font-label-12-semibold">공지</Text>
        </View>
        <Text className="min-w-0 flex-1 text-gray-1000 font-b3" numberOfLines={1}>
          {notice.title}
        </Text>
      </Pressable>
      {loginModal}
    </>
  );
}
