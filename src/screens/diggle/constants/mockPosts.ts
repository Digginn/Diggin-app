import type { FeedPost, PostComment, PostDetail } from "@/types/post";

// TODO: API 연결 전까지 쓰는 임시 데이터. 연결 시 TanStack Query 로 교체한다.
export const CURRENT_USER_ID = "me";

const items = (postId: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `${postId}-${index}`, imageUrl: null }));

export const MOCK_POSTS: (FeedPost & PostDetail)[] = [
  {
    id: "1",
    authorId: CURRENT_USER_ID,
    author: "글쓴이 (나)",
    authorLabel: "익명",
    body: "1번 게시물 - 내가 쓴 글입니다. 케밥을 누르면 삭제 메뉴가 나옵니다.",
    items: items("1", 4),
    timeLabel: "3분 전",
    likeCount: 12,
    commentCount: 3,
    isLiked: false,
  },
  {
    id: "2",
    authorId: "user-block-target",
    author: "디기",
    authorLabel: "익명",
    body: "2번 게시물 - 차단 확인용입니다. 신고하고 차단하면 목록에서 사라집니다.",
    items: items("2", 2),
    timeLabel: "1시간 전",
    likeCount: 5,
    commentCount: 1,
    isLiked: true,
  },
  {
    id: "3",
    authorId: "user-3",
    author: "디기",
    authorLabel: "익명",
    body: "3번 게시물 - 아이템 1개, 좋아요와 댓글이 없는 상태입니다.",
    items: items("3", 1),
    timeLabel: "2일 전",
    likeCount: 0,
    commentCount: 0,
    isLiked: false,
  },
  {
    id: "4",
    authorId: "user-4",
    author: "디기",
    authorLabel: "익명",
    body: "4번 게시물 - 아이템 3개에 반응이 많은 글입니다. 본문이 길어 한 줄에서 잘립니다.",
    items: items("4", 3),
    timeLabel: "오래 전",
    likeCount: 318,
    commentCount: 24,
    isLiked: false,
  },
];

const COMMENTS_BY_POST: Record<string, PostComment[]> = {
  "1": [
    {
      id: "1-0",
      authorId: CURRENT_USER_ID,
      author: "글쓴이 (나)",
      body: "저는 왼쪽이 더 예쁜 것 같아요!",
      timeLabel: "2분 전",
      isMine: true,
    },
    {
      id: "1-1",
      authorId: "user-withdrawn",
      author: "(탈퇴한 사용자)",
      body: "",
      timeLabel: "5분 전",
      isMine: false,
      isDeleted: true,
    },
    {
      id: "1-2",
      authorId: "user-2",
      author: "디기 1",
      body: "여기가 더 싸요 https://diggin.link/a1",
      timeLabel: "10분 전",
      isMine: false,
    },
  ],
  "2": [
    {
      id: "2-0",
      authorId: "user-block-target",
      author: "글쓴이",
      body: "이 댓글도 차단하면 같이 사라집니다.",
      timeLabel: "30분 전",
      isMine: false,
    },
  ],
  "3": [],
  "4": Array.from({ length: 12 }, (_, index) => ({
    id: `4-${index}`,
    authorId: index % 3 === 0 ? CURRENT_USER_ID : `user-${index}`,
    author: index % 3 === 0 ? "글쓴이 (나)" : `디기 ${index + 1}`,
    body: `스크롤 확인용 ${index + 1}번 댓글입니다.`,
    timeLabel: "1시간 전",
    isMine: index % 3 === 0,
  })),
};

export const findMockPost = (id: string) =>
  MOCK_POSTS.find((post) => post.id === id) ?? MOCK_POSTS[0];

export const findMockComments = (id: string) => COMMENTS_BY_POST[id] ?? [];

const MOCK_VOTE_COMMENTS: PostComment[] = [
  {
    id: "vote-2-buy",
    authorId: "vote-user-1",
    author: "디기 1",
    body: "가격 대비 품질이 좋아 보여요.",
    timeLabel: "5분 전",
    isMine: false,
    vote: "buy",
  },
  {
    id: "vote-2-not",
    authorId: "vote-user-2",
    author: "디기 2",
    body: "세일 기간까지 기다려 보세요!",
    timeLabel: "3분 전",
    isMine: false,
    vote: "not",
  },
];

export const findMockVoteComments = (id: string) =>
  id === "2" ? MOCK_VOTE_COMMENTS : findMockComments(id);

// TODO: API 연결 시 내 폴더 목록 조회로 바꾼다.
export const MOCK_FOLDERS = [
  { id: "owned", name: "나의 소장템", isOwnedItems: true },
  { id: "pants", name: "바지" },
  { id: "summer", name: "여름휴가때입을거" },
  { id: "work", name: "출근룩" },
  { id: "gift", name: "선물 리스트" },
  { id: "sports", name: "운동복" },
  { id: "cafe", name: "홈카페" },
  { id: "coat", name: "겨울 코트" },
  { id: "birthday", name: "생일 선물" },
  { id: "hiking", name: "등산" },
];
