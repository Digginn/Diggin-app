export type PostTab = "all" | "vote";

export type PostItem = {
  id: string;
  imageUrl?: string | null;
};

export type FeedPost = {
  id: string;
  body: string;
  items: PostItem[];
  /** 방금 전 · n분 전 · n시간 전 · n일 전 · n달 전, 6개월 이후는 오래 전 */
  timeLabel: string;
  authorLabel: string;
  likeCount: number;
  commentCount: number;
};

export type PostComment = {
  id: string;
  author: string;
  body: string;
  timeLabel: string;
  isMine: boolean;
  isDeleted?: boolean;
};

export type PostDetail = {
  id: string;
  author: string;
  timeLabel: string;
  body: string;
  items: PostItem[];
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
};
