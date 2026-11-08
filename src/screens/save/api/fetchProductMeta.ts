import type { ProductPageRaw } from "../domain/productPageScript";

const HTML_TIMEOUT_MS = 5000;

const ENTITIES: Record<string, string> = {
  "amp": "&",
  "quot": '"',
  "#39": "'",
  "lt": "<",
  "gt": ">",
};
const decode = (text: string) =>
  text.replace(/&(amp|quot|#39|lt|gt);/g, (_, key: string) => ENTITIES[key]);

// 쇼핑몰마다 property·name·content 순서와 따옴표가 달라 태그 하나씩 속성을 읽는다.
function readMeta(html: string) {
  const values = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const name = (key?.[1] ?? key?.[2])?.toLowerCase();
    if (name && content && !values.has(name)) values.set(name, decode(content[1] ?? content[2]));
  }
  return (name: string) => values.get(name) || null;
}

/**
 * 웹뷰를 띄우기 전에 페이지 HTML만 받아 Open Graph 메타를 읽는다. JS를 돌리지 않아 훨씬 빠르다.
 * 404·410은 "gone", 403·429는 "blocked", 연결 실패·시간 초과는 "unreachable"이다.
 * 그 밖의 실패는 null을 돌려주고, 부르는 쪽이 웹뷰로 다시 읽는다.
 */
export async function fetchProductMeta(
  url: string,
): Promise<ProductPageRaw | "gone" | "blocked" | "unreachable" | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTML_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/html" },
    });
    if ([404, 410].includes(response.status)) return "gone";
    if ([403, 429].includes(response.status)) return "blocked";
    if (!response.ok) return null;
    const meta = readMeta(await response.text());
    return {
      finalUrl: response.url || url,
      og: {
        title: meta("og:title"),
        image: meta("og:image"),
        url: meta("og:url"),
        siteName: meta("og:site_name"),
        brand: null,
        price: null,
        currency: null,
        salePrice: null,
        saleCurrency: null,
      },
      ld: null,
      shop: null,
    };
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}
