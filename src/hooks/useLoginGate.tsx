import { useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { LoginRequiredModal } from "@/components/modal";
import { useAuth } from "@/contexts/AuthContext";
import { startLogin } from "@/lib/loginIntent";

/** AUTH-001 회원이면 바로 하고, 비회원이면 공통 로그인 모달을 띄운 뒤 로그인하면 이어 한다. */
export function useLoginGate() {
  const router = useRouter();
  const { session } = useAuth();
  const [pending, setPending] = useState<{ resume: () => void } | null>(null);

  const requireLogin = useCallback(
    (action: () => void) => {
      if (session) return action();
      setPending({ resume: action });
    },
    [session],
  );

  const loginModal = (
    <LoginRequiredModal
      visible={pending !== null && !session}
      onClose={() => setPending(null)}
      onLogin={() => {
        setPending(null);
        startLogin(router, pending?.resume);
      }}
    />
  );

  return { requireLogin, loginModal, isGuest: !session };
}
