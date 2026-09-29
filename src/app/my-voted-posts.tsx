import { useState } from "react";

import { ImageMyVotePlaceholder } from "@/assets/images/my";
import { ReportModal } from "@/components/modal";
import type { VoteListItemData } from "@/screens/my/components/VoteListItem";
import { MyVotedPostsScreen } from "@/screens/my/MyVotedPostsScreen";

// UI 퍼블리싱용 참여 목록. API 연결 시 진행 중·종료 글을 포함하고 삭제된 글은 제외합니다.
const VOTES: VoteListItemData[] = Array.from({ length: 4 }, (_, index) => ({
  id: `participated-vote-${index}`,
  nickname: "디기",
  content:
    "본문 텍스트는 2줄만 노출됩니다. 본문 텍스트는 2줄만 노출됩니다. 본문 텍스트는 2줄만 노출됩니다.",
  timeLabel: "N분 전",
  commentCount: 1,
  imageSource: ImageMyVotePlaceholder,
}));

export default function MyVotedPostsRoute() {
  const [reportedVoteId, setReportedVoteId] = useState<string>();
  const closeReport = () => setReportedVoteId(undefined);

  return (
    <>
      <MyVotedPostsScreen votes={VOTES} onReportVote={setReportedVoteId} />
      {reportedVoteId !== undefined && (
        <ReportModal
          key={reportedVoteId}
          visible
          onRequestClose={closeReport}
          onCancel={closeReport}
          // 현재는 모달 동작 미리보기이며 신고 제출 API는 연결하지 않습니다.
          onReport={closeReport}
        />
      )}
    </>
  );
}
