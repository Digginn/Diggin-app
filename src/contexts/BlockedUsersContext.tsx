import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type BlockedUsersValue = {
  isBlocked: (authorId: string) => boolean;
  block: (authorId: string) => void;
};

const BlockedUsersContext = createContext<BlockedUsersValue | undefined>(undefined);

// TODO: 차단은 계정 단위라 API 연결 시 서버 목록으로 바꾼다. 지금은 앱을 끄면 풀린다
export function BlockedUsersProvider({ children }: { children: ReactNode }) {
  const [blockedIds, setBlockedIds] = useState<ReadonlySet<string>>(new Set());

  const isBlocked = useCallback((authorId: string) => blockedIds.has(authorId), [blockedIds]);
  const block = useCallback(
    (authorId: string) => setBlockedIds((prev) => new Set(prev).add(authorId)),
    [],
  );

  const value = useMemo(() => ({ isBlocked, block }), [isBlocked, block]);

  return <BlockedUsersContext.Provider value={value}>{children}</BlockedUsersContext.Provider>;
}

export function useBlockedUsers() {
  const value = useContext(BlockedUsersContext);
  if (!value) throw new Error("useBlockedUsers must be used within BlockedUsersProvider");
  return value;
}
