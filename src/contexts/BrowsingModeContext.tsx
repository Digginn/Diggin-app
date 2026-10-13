import { createContext, useContext, useState, type ReactNode } from "react";

type BrowsingMode = {
  isGuest: boolean;
  setIsGuest: (isGuest: boolean) => void;
};

const BrowsingModeContext = createContext<BrowsingMode | undefined>(undefined);

// 로그인 연동 전에는 둘러보기 진입 방식만 메모리에 보관한다.
export function BrowsingModeProvider({ children }: { children: ReactNode }) {
  const [isGuest, setIsGuest] = useState(false);

  return (
    <BrowsingModeContext.Provider value={{ isGuest, setIsGuest }}>
      {children}
    </BrowsingModeContext.Provider>
  );
}

export function useBrowsingMode() {
  const mode = useContext(BrowsingModeContext);
  if (!mode) throw new Error("useBrowsingMode must be used within BrowsingModeProvider");
  return mode;
}
