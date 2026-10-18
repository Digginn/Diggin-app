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
  isPreview: boolean;
  isMine: boolean;
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
  body: string | null;
  isPostAuthor: boolean;
  isMine: boolean;
  isWithdrawn: boolean;
  anonNumber: number | null;
};
