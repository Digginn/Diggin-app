import { useState } from "react";

import { ActionModal, ReportModal } from "@/components/modal";

/** null 이면 아무 모달도 떠 있지 않다. */
export type ReportTarget = { authorId: string };

type ReportFlowProps = {
  target: ReportTarget | null;
  onClose: () => void;
  onBlock: (authorId: string) => void;
};

/**
 * 신고 사유 선택부터 차단 여부 확인까지를 한 묶음으로 처리한다.
 * 피드 · 게시글 상세 · 댓글이 같은 흐름을 쓰므로 화면마다 다시 쓰지 않는다.
 */
export function ReportFlow({ target, onClose, onBlock }: ReportFlowProps) {
  const [blockingId, setBlockingId] = useState<string | null>(null);

  function closeBlockConfirm() {
    setBlockingId(null);
  }

  return (
    <>
      <ReportModal
        // 대상이 바뀌면 고른 사유와 입력이 남지 않도록 새로 만든다.
        key={target?.authorId ?? "closed"}
        visible={target !== null}
        onCancel={onClose}
        onRequestClose={onClose}
        onReport={() => {
          // TODO: 신고 접수 API 연결. 지금은 접수된 것으로 보고 차단 여부만 묻는다.
          if (target) setBlockingId(target.authorId);
          onClose();
        }}
      />

      <ActionModal
        visible={blockingId !== null}
        type="2Btn"
        title="신고가 접수되었습니다."
        description={
          "이 사용자를 차단하시겠습니까?\n차단하면 서로의 게시글과 댓글을 볼 수 없습니다."
        }
        secondaryAction={{ label: "괜찮아요", onPress: closeBlockConfirm }}
        primaryAction={{
          label: "차단하기",
          onPress: () => {
            if (blockingId) onBlock(blockingId);
            closeBlockConfirm();
          },
        }}
        onRequestClose={closeBlockConfirm}
      />
    </>
  );
}
