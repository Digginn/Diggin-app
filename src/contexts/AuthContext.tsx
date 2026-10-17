import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";

type Auth = {
  session: Session | null;
  /** 저장된 세션을 아직 읽는 중이다(AUTH-009). 끝나기 전에는 첫 화면을 정하지 않는다. */
  isRestoring: boolean;
  /** 사용자가 로그아웃하지 않았는데 세션이 끊겼다(AUTH-010). */
  isSessionExpired: boolean;
  confirmSessionExpired: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const isSigningOutRef = useRef(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsRestoring(false);
    });
    // 갱신 토큰이 만료·철회되면 SDK가 SIGNED_OUT을 보낸다. 네트워크 오류는 세션을 유지한다.
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event !== "SIGNED_OUT") return;
      // 다음에 로그인한 계정에 이전 계정의 상품이 잠깐이라도 보이지 않게 비운다.
      queryClient.clear();
      if (!isSigningOutRef.current) setIsSessionExpired(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signOut() {
    isSigningOutRef.current = true;
    try {
      // MY-005 이 기기 세션만 끊는다. 기본값(global)은 다른 기기까지 로그아웃시킨다.
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    } finally {
      isSigningOutRef.current = false;
    }
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        isRestoring,
        isSessionExpired,
        confirmSessionExpired: () => setIsSessionExpired(false),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used within AuthProvider");
  return auth;
}
