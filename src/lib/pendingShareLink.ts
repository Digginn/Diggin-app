import { isItemLink } from "@/utils/itemLink";

let pendingLink: string | null = null;

/** SAVE-002 로그인이 풀린 채 공유한 링크. 로그인하면 ALL 탭이 받아 저장을 이어 간다. */
export function keepShareLink(url: string | undefined) {
  // 딥링크로 누구나 넘길 수 있어, 앱에서 붙여넣은 링크와 같은 기준으로 거른다.
  pendingLink = url && isItemLink(url) ? url.trim() : null;
}

export function takeShareLink() {
  const url = pendingLink;
  pendingLink = null;
  return url;
}
