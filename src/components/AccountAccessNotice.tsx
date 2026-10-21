import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  acknowledgeSanction,
  fetchAccountAccess,
  SANCTION_REASON_LABELS,
} from "@/api/accountAccess";
import { useAuth } from "@/contexts/AuthContext";
import { useBrowsingMode } from "@/contexts/BrowsingModeContext";
import { SanctionNoticeModal } from "@/screens/diggle/components/SanctionNoticeModal";
import type { SanctionNotice } from "@/screens/diggle/utils/sanctionMessages";

export function AccountAccessNotice() {
  const { session, suspension, endSuspendedSession, confirmSuspension } = useAuth();
  const viewer = session?.user.id ?? null;
  const pathname = usePathname();
  const router = useRouter();
  const { setIsGuest } = useBrowsingMode();
  const client = useQueryClient();
  const key = ["account-access", viewer];
  const access = useQuery({
    queryKey: key,
    queryFn: () => fetchAccountAccess(),
    enabled: !!viewer,
    retry: 1,
  });
  const { refetch } = access;
  const [confirmation, setConfirmation] = useState({ viewer, isConfirming: false, error: "" });
  if (confirmation.viewer !== viewer) setConfirmation({ viewer, isConfirming: false, error: "" });
  const { isConfirming, error } = confirmation;
  const setConfirming = (value: boolean) =>
    setConfirmation((previous) => ({ ...previous, isConfirming: value }));
  const setError = (value: string) =>
    setConfirmation((previous) => ({ ...previous, error: value }));
  const busy = useRef(false);
  const lifetime = useRef({ active: true });
  const shownSuspension = useRef<string | null>(null);
  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    busy.current = false;
    return () => {
      current.active = false;
    };
  }, [viewer]);
  useEffect(() => {
    if (!viewer) return;
    void refetch();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refetch();
    });
    return () => sub.remove();
  }, [viewer, pathname, refetch]);
  useEffect(() => {
    if (access.data?.status === "suspended" && viewer && !busy.current) {
      busy.current = true;
      void endSuspendedSession(access.data).catch(() => {});
    }
  }, [access.data, viewer, endSuspendedSession]);
  useEffect(() => {
    if (!suspension) {
      shownSuspension.current = null;
      return;
    }
    const id = suspension.sanctionId ?? "suspended";
    if (shownSuspension.current === id) return;
    shownSuspension.current = id;
    setIsGuest(true);
    router.replace("/login");
  }, [suspension, router, setIsGuest]);
  const state = suspension ?? access.data;
  const isSuspended = !!suspension;
  const shouldShow =
    isSuspended || (pathname === "/diggle" && !state?.noticeSeenAt && !!state?.sanctionId);
  const reasonLabel = state?.reasonCategory
    ? SANCTION_REASON_LABELS[state.reasonCategory]
    : "1:1 문의로 확인해 주세요.";
  const notice: SanctionNotice | null =
    state?.status === "warning"
      ? { type: "warning" }
      : state?.status === "community_restricted" && state.restrictedUntil
        ? { type: "community_restricted", restrictedUntil: state.restrictedUntil, reasonLabel }
        : isSuspended
          ? { type: "suspended", reasonLabel }
          : null;
  async function confirm() {
    if (isSuspended) {
      confirmSuspension();
      return;
    }
    if (busy.current || !state?.sanctionId) return;
    const current = lifetime.current;
    busy.current = true;
    setConfirming(true);
    setError("");
    try {
      await acknowledgeSanction(state.sanctionId);
      if (!current.active) return;
      client.setQueryData(key, { ...state, noticeSeenAt: new Date().toISOString() });
    } catch {
      if (current.active) setError("확인 내용을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if (current.active) {
        busy.current = false;
        setConfirming(false);
      }
    }
  }
  return notice && shouldShow ? (
    <SanctionNoticeModal
      visible
      notice={notice}
      onConfirm={() => void confirm()}
      isConfirming={isConfirming}
      confirmationError={error}
      onErrorDismiss={() => setError("")}
    />
  ) : null;
}
