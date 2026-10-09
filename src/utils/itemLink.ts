// 호스트에 점이 있고 끝이 두 글자 이상인 http(s) 주소만 아이템 링크로 본다.
// musinsa.com 은 통과하고, https://ㅁㄴㅇㄹ 이나 https:// . 처럼 존재할 수 없는 주소는 걸러진다.
const ITEM_LINK = /https?:\/\/[^\s/:<>"']+\.[^\s/:<>"']{2,}(?:\/[^\s<>"']*)?/i;
const ITEM_LINK_ONLY = new RegExp(`^${ITEM_LINK.source}$`, "i");

/** 제목과 링크를 같이 복사하는 앱이 많아 전체 일치가 아니라 첫 링크를 뽑는다. */
export function findItemLink(text: string): string | null {
  return ITEM_LINK.exec(text)?.[0] ?? null;
}

/** 사용자가 직접 붙여넣은 값은 통째로 링크여야 한다. */
export function isItemLink(text: string): boolean {
  return ITEM_LINK_ONLY.test(text.trim());
}

// scheme:// 로 시작하는 모든 주소. http · https 가 아니면 앱 전용 주소다.
const ANY_SCHEME = /\b[a-z][a-z0-9+.-]*:\/\//i;

/** 공유로 받은 값을 왜 쓸 수 없는지 가른다. 쓸 수 있으면 null 이다. */
export function classifyItemLink(text: string): "no_url" | "deeplink" | "invalid_format" | null {
  if (findItemLink(text)) return null;
  const scheme = ANY_SCHEME.exec(text)?.[0];
  if (!scheme) return "no_url";
  // https://ㅁㄴㅇㄹ 처럼 웹 주소 모양이지만 호스트가 성립하지 않는 경우
  return /^https?:\/\//i.test(scheme) ? "invalid_format" : "deeplink";
}
