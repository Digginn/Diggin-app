import { splitGraphemes } from "unicode-segmenter/grapheme";

import type { ItemSaveValues } from "@/types/wish-item";

import type { ProductPageRaw } from "./productPageScript";

const NAME_MAX = 100;
const BRAND_MAX = 30;
const PRICE_MAX = 2147483647;

// 페이지마다 값의 모양이 달라(29CM은 이미지가 객체) 문자열이 아니면 없는 값으로 본다.
const asText = (value: unknown) => (typeof value === "string" ? value : null);

/** DB는 char_length(코드 포인트)로 세지만 이모지 조합 중간에서 자르지 않도록 글자 단위로 담는다. */
function truncate(text: string | null, max: number) {
  const trimmed = text?.normalize("NFC").trim();
  if (!trimmed) return "";
  let result = "";
  for (const grapheme of splitGraphemes(trimmed)) {
    if ([...result].length + [...grapheme].length > max) break;
    result += grapheme;
  }
  return result;
}

/** "상품명 - 에이블리", "상품명 | 무신사"처럼 뒤에 붙은 사이트 이름을 뗀다. 제목이 사이트 이름뿐이면 상품명이 아니다. */
function cleanTitle(title: string | null, siteName: string | null) {
  if (!title || !siteName) return title;
  const site = siteName.toLowerCase();
  const parts = title.split(/\s[-|:]\s/);
  while (parts.length > 1 && parts.at(-1)!.toLowerCase().includes(site)) parts.pop();
  const cleaned = parts.join(" - ").trim();
  return cleaned.toLowerCase() === site ? null : cleaned;
}

/** 원화로 확인된 값만 정수 문자열로 바꾼다. "25,080", 25800, "106000.0"을 받고 소수·음수·범위 밖은 버린다. */
function toKrwPrice(value: unknown, currency: unknown) {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    asText(currency)?.toUpperCase() !== "KRW"
  ) {
    return null;
  }
  const text = String(value).replace(/,/g, "").trim();
  const match = /^(\d+)(?:\.0+)?$/.exec(text);
  if (!match || Number(match[1]) > PRICE_MAX) return null;
  return String(Number(match[1]));
}

function toHttpsImage(value: unknown) {
  const url = asText(value);
  if (!url) return null;
  const absolute = url.startsWith("//") ? `https:${url}` : url;
  return absolute.startsWith("https://") ? absolute : null;
}

/** og:url이 홈페이지면 상품이 아니라 사이트 기본 메타다(번개장터의 삭제·미로딩 상품). 제목·이미지가 로고가 된다. */
function isSiteDefault(ogUrl: unknown) {
  // React Native의 URL은 pathname을 지원하지 않는 버전이 있어 정규식으로 본다.
  return /^https?:\/\/[^/?#]+\/?(?:[?#]|$)/i.test(asText(ogUrl) ?? "");
}

// 광고·유입 추적용 이름이 확실한 값만 뗀다. 상품 옵션이나 쿠팡 vendorItemId처럼 상품을 가르는 값은 남긴다.
const TRACKING_PARAM =
  /^(utm_.*|nt_.*|airbridge.*|fbclid|gclid|igshid|napm|is_retargeting|source_caller|sourcetype|searchid)$/i;

/** 같은 상품이 추적값만 달라 다른 링크로 저장되지 않게 한다(SAVE-012 중복 검사). */
export function stripTrackingParams(url: string) {
  const hashAt = url.indexOf("#");
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  if (queryAt === -1) return url;
  const kept = beforeHash
    .slice(queryAt + 1)
    .split("&")
    .filter((pair) => pair && !TRACKING_PARAM.test(pair.split("=")[0]));
  return beforeHash.slice(0, queryAt) + (kept.length ? `?${kept.join("&")}` : "") + hash;
}

/**
 * SAVE-005·006·007 페이지에서 모은 재료로 저장 시트 초안을 만든다.
 * 정확한 출처부터 쓴다: 쇼핑몰 전용 데이터 → JSON-LD 상품 정보 → Open Graph.
 * 상품명을 못 찾으면 실패로 보고, 찾은 값만 채운 채 사용자가 나머지를 입력한다.
 */
export function normalizeProductPage(
  raw: ProductPageRaw,
  sourceUrl: string,
): { values: ItemSaveValues; hasFailed: boolean } {
  const { ld, shop } = raw;
  const og = isSiteDefault(raw.og.url)
    ? { ...raw.og, title: null, image: null, price: null }
    : raw.og;
  const name = truncate(
    asText(shop?.name) ?? asText(ld?.name) ?? cleanTitle(asText(og.title), asText(og.siteName)),
    NAME_MAX,
  );
  const price =
    toKrwPrice(shop?.price, "KRW") ??
    toKrwPrice(ld?.price, ld?.currency) ??
    toKrwPrice(og.price, og.currency);
  const hasFailed = name === "";

  return {
    hasFailed,
    values: {
      name,
      brand: truncate(asText(shop?.brand) ?? asText(ld?.brand), BRAND_MAX),
      price: price ?? "",
      // SAVE-003 리다이렉트를 따라간 최종 주소. 못 읽었으면 로그인·만료 페이지일 수 있어 원래 링크를 둔다.
      sourceUrl: stripTrackingParams(
        hasFailed || !raw.finalUrl.startsWith("https://") ? sourceUrl : raw.finalUrl,
      ),
      // 상품명을 못 읽은 페이지의 이미지는 사이트 로고일 때가 많다. 저장 후 못 바꾸니(PDT-006) 쓰지 않는다.
      thumbnailUrl: hasFailed ? null : (toHttpsImage(ld?.image) ?? toHttpsImage(og.image)),
      wishLevel: null,
    },
  };
}
