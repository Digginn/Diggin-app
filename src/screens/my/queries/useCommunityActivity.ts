import { useInfiniteQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { COMMUNITY_PAGE_SIZE, communityKeys } from "@/screens/diggle/api/community";
import type { CommunityCursor } from "@/screens/diggle/types/community";

import { fetchCommunityActivity, type ActivityKind } from "../api/communityActivity";

export function useCommunityActivity(kind: ActivityKind) {
  const { session, isRestoring } = useAuth();
  return useInfiniteQuery({
    queryKey: communityKeys.activity(session?.user.id ?? null, kind),
    queryFn: ({ pageParam }) => fetchCommunityActivity(kind, pageParam),
    initialPageParam: null as CommunityCursor | null,
    getNextPageParam: (page) =>
      page.length === COMMUNITY_PAGE_SIZE ? page.at(-1)?.cursor : undefined,
    enabled: !isRestoring && session !== null,
  });
}
