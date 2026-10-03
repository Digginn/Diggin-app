import { ImageMyVotePlaceholder } from "@/assets/images/my";
import { MyPostsScreen, type MyPost, type MyVote } from "@/screens/my/MyPostsScreen";

// UI 퍼블리싱용 데이터. 실제 목록 조회 및 상세 이동은 API·상세 화면 연결 시 교체합니다.
const POSTS: MyPost[] = Array.from({ length: 2 }, (_, index) => ({
  id: `post-${index}`,
  nickname: "디기",
  content: "내용은 한 줄만 보여줍니다. 제목이 없으므로 한 줄만 노출합니다.",
  dateLabel: "2026.09.12",
}));

const VOTES: MyVote[] = Array.from({ length: 3 }, (_, index) => ({
  id: `vote-${index}`,
  nickname: "디기",
  content:
    "본문 텍스트는 2줄만 노출됩니다. 본문 텍스트는 2줄만 노출됩니다. 본문 텍스트는 2줄만 노출됩니다.",
  timeLabel: "N분 전",
  commentCount: 1,
  imageSource: ImageMyVotePlaceholder,
}));

export default function MyPostsRoute() {
  return <MyPostsScreen posts={POSTS} votes={VOTES} />;
}
