import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { PostItem } from "@/types/post";

type PostDraftValue = {
  items: PostItem[];
  setItems: (items: PostItem[]) => void;
  reset: () => void;
};

const PostDraftContext = createContext<PostDraftValue | undefined>(undefined);

// TODO: 전역 상태를 Zustand 로 옮기기로 하면 이 Context 를 걷어낸다
export function PostDraftProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PostItem[]>([]);
  const reset = useCallback(() => setItems([]), []);
  const value = useMemo(() => ({ items, setItems, reset }), [items, reset]);

  return <PostDraftContext.Provider value={value}>{children}</PostDraftContext.Provider>;
}

export function usePostDraft() {
  const value = useContext(PostDraftContext);
  if (!value) throw new Error("usePostDraft must be used within PostDraftProvider");
  return value;
}
