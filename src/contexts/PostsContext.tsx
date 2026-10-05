import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import { CURRENT_USER_ID, MOCK_POSTS } from "@/screens/diggle/constants/mockPosts";
import { getVoteTiming } from "@/screens/diggle/utils/voteTiming";
import type { PostItem, VoteChoice, VotePost } from "@/types/post";

type Post = (typeof MOCK_POSTS)[number];

type PostsValue = {
  posts: Post[];
  votes: VotePost[];
  addVotePreview: (body: string, items: PostItem[]) => void;
  chooseVote: (id: string, choice: VoteChoice) => void;
  deleteVote: (id: string) => void;
  findPost: (id: string) => Post | undefined;
  addPost: (post: Post) => void;
  deletePost: (id: string) => void;
};

const PostsContext = createContext<PostsValue | undefined>(undefined);
const MOCK_VOTE_AGES_MS = [3 * 60000, 60 * 60000, 2 * 86400000, 180 * 86400000];

// TODO: API 연결 시 TanStack Query 로 바꾼다
export function PostsProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);
  const [votes, setVotes] = useState<VotePost[]>(() => {
    const now = Date.now();
    return MOCK_POSTS.map((post, index) => {
      const createdAt = now - (MOCK_VOTE_AGES_MS[index] ?? 0);
      return {
        ...post,
        createdAt,
        items: post.items.slice(0, 1),
        buyCount: 12,
        notCount: 5,
        myChoice: index === 1 || index === 2 ? "BUY" : null,
        ...getVoteTiming(createdAt, now),
      };
    });
  });

  useEffect(() => {
    function refreshTiming() {
      const now = Date.now();
      setVotes((prev) => {
        let hasChanged = false;
        const next = prev.map((vote) => {
          const timing = getVoteTiming(vote.createdAt, now);
          // 이미 종료된 투표는 기기 시각이 뒤로 바뀌어도 다시 열지 않는다.
          if (vote.isClosed || vote.remainingLabel === timing.remainingLabel) return vote;
          hasChanged = true;
          return { ...vote, ...timing };
        });
        return hasChanged ? next : prev;
      });
    }
    const interval = setInterval(refreshTiming, 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshTiming();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);
  // UI 확인용 메모리 데이터이며 앱 재시작 시 초기화된다. API 연결 시 교체한다.
  const addVotePreview = useCallback((body: string, items: PostItem[]) => {
    const createdAt = Date.now();
    const vote: VotePost = {
      id: `vote-${createdAt}`,
      createdAt,
      authorId: CURRENT_USER_ID,
      author: "글쓴이 (나)",
      authorLabel: "익명",
      body,
      items: [...items],
      timeLabel: "방금 전",
      likeCount: 0,
      commentCount: 0,
      isLiked: false,
      buyCount: 0,
      notCount: 0,
      myChoice: null,
      ...getVoteTiming(createdAt, createdAt),
    };
    setVotes((prev) => [vote, ...prev]);
  }, []);
  const chooseVote = useCallback((id: string, choice: VoteChoice) => {
    setVotes((prev) =>
      prev.map((vote) => {
        if (
          vote.id !== id ||
          vote.authorId === CURRENT_USER_ID ||
          vote.isClosed ||
          getVoteTiming(vote.createdAt).isClosed ||
          vote.myChoice === choice
        )
          return vote;
        return {
          ...vote,
          buyCount: vote.buyCount - Number(vote.myChoice === "BUY") + Number(choice === "BUY"),
          notCount: vote.notCount - Number(vote.myChoice === "NOT") + Number(choice === "NOT"),
          myChoice: choice,
        };
      }),
    );
  }, []);
  const deleteVote = useCallback(
    (id: string) => setVotes((prev) => prev.filter((vote) => vote.id !== id)),
    [],
  );

  const findPost = useCallback((id: string) => posts.find((post) => post.id === id), [posts]);
  const addPost = useCallback((post: Post) => setPosts((prev) => [post, ...prev]), []);
  const deletePost = useCallback(
    (id: string) => setPosts((prev) => prev.filter((post) => post.id !== id)),
    [],
  );

  const value = useMemo(
    () => ({
      posts,
      votes,
      addVotePreview,
      chooseVote,
      deleteVote,
      findPost,
      addPost,
      deletePost,
    }),
    [posts, votes, addVotePreview, chooseVote, deleteVote, findPost, addPost, deletePost],
  );

  return <PostsContext.Provider value={value}>{children}</PostsContext.Provider>;
}

export function usePosts() {
  const value = useContext(PostsContext);
  if (!value) throw new Error("usePosts must be used within PostsProvider");
  return value;
}
