import { fetch } from "expo/fetch";

export const isNaverShortLink = (url: string) =>
  /^https:\/\/naver\.me\/[a-z0-9]+\/?(?:[?#].*)?$/i.test(url);

/** 네이버 짧은 공유 링크는 상품 주소부터 확인한다. 상품 정보 자체는 기존 WebView가 읽는다. */
export async function resolveProductPageUrl(url: string, signal?: AbortSignal): Promise<string> {
  if (!isNaverShortLink(url) || signal?.aborted) return url;
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 4000);
  try {
    // 상품 페이지까지 HTTP 요청으로 따라가면 429가 올 수 있어 짧은 링크의 Location만 읽는다.
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      credentials: "omit",
      signal: abort.signal,
    });
    const target = response.headers.get("location");
    if (
      [301, 302, 303, 307, 308].includes(response.status) &&
      target &&
      /^https:\/\/(?:m\.)?(?:smartstore|brand)\.naver\.com\/[^/?#]+\/products\/\d+(?:[/?#]|$)/i.test(
        target,
      )
    ) {
      return target;
    }
  } catch {
    // 해석 실패·시간 초과는 기존 WebView 경로로 넘긴다. 앱 링크나 다른 사이트를 임의로 열지 않는다.
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
  return url;
}
