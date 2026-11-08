import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";

import {
  COMMUNITY_PAGE_SIZE,
  communityKeys,
  fetchCommunityComments,
  fetchCommunityFeed,
  fetchCommunityPost,
} from "../api/community";
import type { CommunityCursor } from "../types/community";

export function useCommunityFeed(tab: "all" | "vote") {
  const { session, isRestoring } = useAuth();
  return useInfiniteQuery({
    queryKey: communityKeys.feed(session?.user.id ?? null, tab),
    queryFn: ({ pageParam }) => fetchCommunityFeed(tab, pageParam),
    initialPageParam: null as CommunityCursor | null,
    getNextPageParam: (page) => (page.length === COMMUNITY_PAGE_SIZE ? page.at(-1) : undefined),
    enabled: !isRestoring,
  });
}

export function useCommunityPost(id: string) {
  const { session, isRestoring } = useAuth();
  return useQuery({
    queryKey: communityKeys.post(session?.user.id ?? null, id),
    queryFn: () => fetchCommunityPost(id),
    enabled: !isRestoring && session !== null,
  });
}

export function useCommunityComments(id: string, isEnabled: boolean) {
  const { session, isRestoring } = useAuth();
  return useInfiniteQuery({
    queryKey: communityKeys.comments(session?.user.id ?? null, id),
    queryFn: ({ pageParam }) => fetchCommunityComments(id, pageParam),
    initialPageParam: null as CommunityCursor | null,
    getNextPageParam: (page) => (page.length === COMMUNITY_PAGE_SIZE ? page.at(-1) : undefined),
    enabled: !isRestoring && session !== null && isEnabled,
  });
}
