import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { fetchAccountAccess, type AccountAccess } from "@/api/accountAccess";
import { setAnalyticsUser } from "@/lib/analytics";
import { finishDeviceSignOut, unregisterDevicePush } from "@/lib/pushNotifications";
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
  suspension: AccountAccess | null;
  confirmSuspension: () => void;
  endSuspendedSession: (access: AccountAccess) => Promise<void>;
};

const AuthContext = createContext<Auth | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const isSigningOutRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const revision = useRef(0);
  const [suspension, setSuspension] = useState<AccountAccess | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      sessionRef.current = data.session;
      setSession(data.session);
      setIsRestoring(false);
    });
    // 갱신 토큰이 만료·철회되면 SDK가 SIGNED_OUT을 보낸다. 네트워크 오류는 세션을 유지한다.
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const previous = sessionRef.current;
      sessionRef.current = nextSession;
      const currentRevision = ++revision.current;
      setSession(nextSession);
      if (event !== "SIGNED_OUT") {
        if (nextSession) setAnalyticsUser(nextSession.user.id);
        return;
      }
      setAnalyticsUser(null);
      // 다음에 로그인한 계정에 이전 계정의 상품이 잠깐이라도 보이지 않게 비운다.
      queryClient.clear();
      if (!isSigningOutRef.current) {
        if (!previous) {
          setIsSessionExpired(true);
          return;
        }
        // SDK 콜백 안에서 Auth API를 기다리지 않는다. 이전 JWT는 본인 안내 조회에만 쓴다.
        setTimeout(() => {
          void fetchAccountAccess(previous.access_token)
            .then((access) => {
              if (revision.current !== currentRevision) return;
              if (access.status === "suspended") {
                setSuspension(access);
                setIsSessionExpired(false);
              } else setIsSessionExpired(true);
            })
            .catch(() => {
              if (revision.current === currentRevision) setIsSessionExpired(true);
            });
        }, 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signOut() {
    isSigningOutRef.current = true;
    try {
      await unregisterDevicePush();
      // MY-005 이 기기 세션만 끊는다. 기본값(global)은 다른 기기까지 로그아웃시킨다.
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    } finally {
      finishDeviceSignOut();
      isSigningOutRef.current = false;
    }
  }

  async function endSuspendedSession(access: AccountAccess) {
    setSuspension(access);
    setIsSessionExpired(false);
    try {
      await signOut();
    } finally {
      sessionRef.current = null;
      setSession(null);
      queryClient.clear();
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
        suspension,
        confirmSuspension: () => setSuspension(null),
        endSuspendedSession,
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
