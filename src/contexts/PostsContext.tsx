import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { MOCK_POSTS } from "@/screens/diggle/constants/mockPosts";

type Post = (typeof MOCK_POSTS)[number];

type PostsValue = {
  posts: Post[];
  findPost: (id: string) => Post | undefined;
  deletePost: (id: string) => void;
};

const PostsContext = createContext<PostsValue | undefined>(undefined);

// TODO: API 연결 시 TanStack Query 로 바꾼다
export function PostsProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);

  const findPost = useCallback((id: string) => posts.find((post) => post.id === id), [posts]);
  const deletePost = useCallback(
    (id: string) => setPosts((prev) => prev.filter((post) => post.id !== id)),
    [],
  );

  const value = useMemo(() => ({ posts, findPost, deletePost }), [posts, findPost, deletePost]);

  return <PostsContext.Provider value={value}>{children}</PostsContext.Provider>;
}

export function usePosts() {
  const value = useContext(PostsContext);
  if (!value) throw new Error("usePosts must be used within PostsProvider");
  return value;
}
