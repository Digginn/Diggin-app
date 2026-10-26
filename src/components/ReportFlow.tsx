import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { Modal } from "@/components/modal/Modal";
import { ModalButton } from "@/components/modal/ModalButton";
import { ReportForm } from "@/components/modal/ReportModal";
import { DIGGLE_TOAST_MESSAGES } from "@/constants/messages";
import { REPORT_MESSAGES, type ReportReason, type ReportTarget } from "@/constants/report";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";
import { communityKeys } from "@/screens/diggle/api/community";
import {
  blockCommunityAuthor,
  reportCommunityContent,
} from "@/screens/diggle/api/communityReporting";
import { communityWriteError } from "@/screens/diggle/api/communityWrite";

export type { ReportTarget } from "@/constants/report";

export function ReportFlow({
  target,
  onClose,
}: {
  target: ReportTarget | null;
  onClose: () => void;
}) {
  return target ? (
    <ReportDialog key={`${target.type}:${target.id}`} target={target} onClose={onClose} />
  ) : null;
}

// 한 NativeModal에서 신고 → 차단 확인을 전환해 iOS 모달 연속 표시 경합을 피한다.
export function ReportDialog({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const { session } = useAuth();
  const viewer = session?.user.id ?? null;
  const [owner] = useState(viewer);
  const [phase, setPhase] = useState<"report" | "block">("report");
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const lifetime = useRef({ active: true });
  const queryClient = useQueryClient();
  const showToast = useToast();
  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    return () => {
      current.active = false;
    };
  }, [viewer]);
  useEffect(() => {
    if (viewer !== owner) onClose();
  }, [viewer, owner, onClose]);
  const close = () => {
    if (!busy.current) onClose();
  };

  async function submit(reason?: ReportReason, detail = "") {
    if (!viewer || viewer !== owner || busy.current) return;
    const current = lifetime.current;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      if (phase === "report") {
        if (!reason) return;
        await reportCommunityContent(target, reason, detail);
      } else await blockCommunityAuthor(target);
      if (!current.active) return;
      await queryClient.invalidateQueries({ queryKey: communityKeys.all }, { throwOnError: true });
      if (!current.active) return;
      if (phase === "report") setPhase("block");
      else {
        showToast(DIGGLE_TOAST_MESSAGES.REPORT_004);
        onClose();
      }
    } catch (failure) {
      if (current.active)
        setError(phase === "block" ? REPORT_MESSAGES.blockFailed : communityWriteError(failure));
    } finally {
      if (current.active) {
        busy.current = false;
        setPending(false);
      }
    }
  }

  return (
    <Modal
      // 직접 작성 입력칸이 키보드에 가려지지 않게 iOS도 키보드 위로 올린다(BUG-051).
      isKeyboardAvoiding={phase === "report"}
      keyboardGap={16}
      visible={!!viewer && viewer === owner}
      onRequestClose={close}
      toastMessage={error || undefined}
      onToastDismiss={() => setError("")}
    >
      {phase === "report" ? (
        <ReportForm
          onCancel={close}
          onReport={(reason, detail) => void submit(reason, detail)}
          isPending={isPending}
        />
      ) : (
        <>
          <Text className="text-gray-900 font-label-16-semibold">{REPORT_MESSAGES.title}</Text>
          <Text className="text-gray-500 font-b3">{REPORT_MESSAGES.blockDescription}</Text>
          <View className="w-[295px] flex-row gap-modal-action">
            <View className="w-[140px]">
              <ModalButton
                variant="secondary"
                action={{ label: "괜찮아요", onPress: close, isDisabled: isPending }}
              />
            </View>
            <View className="w-[140px]">
              <ModalButton
                action={{
                  label: isPending ? "차단 중…" : "차단하기",
                  onPress: () => void submit(),
                  isDisabled: isPending,
                }}
              />
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
