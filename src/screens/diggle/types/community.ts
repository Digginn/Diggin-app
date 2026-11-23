export type CommunityCursor = { createdAt: string; id: string };

export type CommunityItem = {
  id: string;
  imageUrl: string | null;
  name: string | null;
  brand: string | null;
  price: number | null;
  url: string | null;
};

export type CommunityPost = CommunityCursor & {
  type: "post" | "vote";
  body: string;
  notice?: { title: string; commentsClosed: boolean };
  isPreview: boolean;
  isMine: boolean;
  authorNickname: string | null;
  items: CommunityItem[];
  likeCount: number | null;
  commentCount: number | null;
  isLiked: boolean;
  endsAt: string | null;
  serverNow: string | null;
  myChoice: "buy" | "not" | null;
  buyCount: number | null;
  notCount: number | null;
};

export type CommunityComment = CommunityCursor & {
  isOperator: boolean;
  voteChoice: "buy" | "not" | null;
  body: string | null;
  isPostAuthor: boolean;
  isMine: boolean;
  isWithdrawn: boolean;
  authorNickname: string | null;
  anonNumber: number | null;
  parentId: string | null;
  likeCount: number;
  isLiked: boolean;
  /** 원 댓글에만 서버가 오래된 순으로 담아 준다. */
  replies: CommunityComment[];
};
