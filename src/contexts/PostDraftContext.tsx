import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { PostItem } from "@/types/post";

import { useAuth } from "./AuthContext";

type PostDraftValue = {
  items: PostItem[];
  setItems: (items: PostItem[]) => void;
  reset: () => void;
};

const PostDraftContext = createContext<PostDraftValue | undefined>(undefined);

// TODO: 전역 상태를 Zustand 로 옮기기로 하면 이 Context 를 걷어낸다
export function PostDraftProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const owner = session?.user.id ?? null;
  const [draft, setDraft] = useState<{ owner: string | null; items: PostItem[] }>({
    owner: null,
    items: [],
  });
  const items = useMemo(() => (draft.owner === owner ? draft.items : []), [draft, owner]);
  const setItems = useCallback((items: PostItem[]) => setDraft({ owner, items }), [owner]);
  const reset = useCallback(() => setDraft({ owner: null, items: [] }), []);
  const value = useMemo(() => ({ items, setItems, reset }), [items, setItems, reset]);

  return <PostDraftContext.Provider value={value}>{children}</PostDraftContext.Provider>;
}

export function usePostDraft() {
  const value = useContext(PostDraftContext);
  if (!value) throw new Error("usePostDraft must be used within PostDraftProvider");
  return value;
}
