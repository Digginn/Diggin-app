import { splitGraphemes } from "unicode-segmenter/grapheme";

import type { ItemSaveValues } from "@/types/wish-item";

import { APP_LINK_HOST, type ProductPageRaw } from "./productPageScript";
import { toMobileSmartStoreUrl } from "./productPageUrl";
import { isRestrictedProduct } from "./restrictedProduct";

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

// og:site_name이 없는 쇼핑몰도 제목 끝 사이트 이름을 떼려고 둔다. 정확히 일치할 때만 떼서 "저지 - 블랙" 같은 색상은 남긴다.
const KNOWN_SITE_NAMES = [
  "에이블리",
  "에이블리 스토어",
  "무신사",
  "29cm",
  "지그재그",
  "오늘의집",
  "kream",
  "번개장터",
  "쿠팡",
  "올리브영",
];

/** "상품명 - 에이블리", "상품명 | 무신사"처럼 뒤에 붙은 사이트 이름을 뗀다. 제목이 사이트 이름뿐이면 상품명이 아니다. */
function cleanTitle(title: string | null, siteName: string | null) {
  if (!title) return null;
  const site = siteName?.trim().toLowerCase();
  const isSiteName = (part: string) => {
    const text = part.trim().toLowerCase();
    return KNOWN_SITE_NAMES.includes(text) || text === site;
  };
  const parts = title.split(/\s[-|:]\s/);
  // 뒤 조각은 "Nike.com"처럼 사이트 이름이 들어 있기만 해도 뗀다.
  while (
    parts.length > 1 &&
    (isSiteName(parts.at(-1)!) || (!!site && parts.at(-1)!.toLowerCase().includes(site)))
  )
    parts.pop();
  const cleaned = parts.join(" - ").trim();
  // 제목 전체는 사이트 이름과 똑같을 때만 버린다. "Nike Air Force 1"처럼 사이트 이름으로 시작하는 상품명이 있다.
  return isSiteName(cleaned) ? null : cleaned;
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
  /^(utm_.*|nt_.*|airbridge.*|fbclid|gclid|igshid|napm|is_retargeting|source_caller|sourcetype|searchid|tracking_content|https_deeplink|short_id)$/i;
// AppsFlyer 앱 공유 링크(29CM 등)가 붙이는 값. 순서·값이 매번 달라 같은 상품이 따로 저장됐다(#91).
// pid·c는 다른 쇼핑몰에선 상품 값일 수 있어 AppsFlyer 표시가 있을 때만 뗀다.
// 짧은 공유 링크에서는 af_dp·deep_link_value가 상품을 가리켜, 최종 상품 주소에 도착했을 때만 뗀다.
const APPSFLYER_MARK = /^(af_.*|shortlink|onelink_id)$/i;
const APPSFLYER_PARAM = /^(af_.*|shortlink|onelink_id|pid|c|deep_link_value|deep_link_sub\d+)$/i;

/** 같은 상품이 추적값만 달라 다른 링크로 저장되지 않게 한다(SAVE-012 중복 검사). */
export function stripTrackingParams(url: string, isProductPage = false) {
  const hashAt = url.indexOf("#");
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  if (queryAt === -1) return url;
  const pairs = beforeHash.slice(queryAt + 1).split("&");
  const isAppsFlyer =
    isProductPage && pairs.some((pair) => APPSFLYER_MARK.test(pair.split("=")[0]));
  const kept = pairs.filter((pair) => {
    const key = pair.split("=")[0];
    return pair && !TRACKING_PARAM.test(key) && !(isAppsFlyer && APPSFLYER_PARAM.test(key));
  });
  return beforeHash.slice(0, queryAt) + (kept.length ? `?${kept.join("&")}` : "") + hash;
}

// 회원 전용·성인 인증 상품은 로그인 페이지로 넘어가 그 제목이 상품명으로 들어간다. 쿼리의 돌아갈 주소는 보지 않는다.
const LOGIN_PAGE = /^https?:\/\/[^?#]*[/.](?:log-?in|sign-?in)\b/i;

/**
 * SAVE-005·006·007 페이지에서 모은 재료로 저장 시트 초안을 만든다.
 * 정확한 출처부터 쓴다: 쇼핑몰 전용 데이터 → JSON-LD 상품 정보 → Open Graph → 마이크로데이터 → eg: 메타.
 * 가격만은 할인가가 명시된 값을 먼저 쓴다.
 * 상품명을 못 찾으면 실패로 보고, 찾은 값만 채운 채 사용자가 나머지를 입력한다.
 */
export function normalizeProductPage(
  raw: ProductPageRaw,
  sourceUrl: string,
): { values: ItemSaveValues; hasFailed: boolean } {
  const fallbackUrl = stripTrackingParams(toMobileSmartStoreUrl(sourceUrl));
  // 앱 연결 중간 페이지나 로그인 페이지에서 끝났으면 상품 정보가 아니다. 직접 입력으로 넘긴다.
  if (
    APP_LINK_HOST.test(/^https?:\/\/([^/?#]+)/i.exec(raw.finalUrl)?.[1] ?? "") ||
    LOGIN_PAGE.test(raw.finalUrl)
  ) {
    return {
      hasFailed: true,
      values: {
        name: "",
        brand: "",
        price: "",
        sourceUrl: fallbackUrl,
        thumbnailUrl: null,
        wishLevel: null,
      },
    };
  }
  const { ld, shop } = raw;
  const og = isSiteDefault(raw.og.url)
    ? { ...raw.og, title: null, image: null, price: null, salePrice: null }
    : raw.og;
  const name = truncate(
    asText(shop?.name) ?? asText(ld?.name) ?? cleanTitle(asText(og.title), asText(og.siteName)),
    NAME_MAX,
  );
  // SAVE-010 할인가가 명시된 값(product:sale_price, eg:salePrice)을 정가일 수 있는 값보다 먼저 쓴다.
  // 쇼핑몰 전용 데이터는 이미 판매가를 읽는다.
  const price =
    toKrwPrice(shop?.price, "KRW") ??
    toKrwPrice(og.salePrice, og.saleCurrency) ??
    toKrwPrice(raw.eg?.price, "KRW") ??
    toKrwPrice(ld?.price, ld?.currency) ??
    toKrwPrice(og.price, og.currency) ??
    toKrwPrice(raw.md?.price, raw.md?.currency);
  const hasFailed = name === "";
  // 추출 상품명은 화면 길이 제한 전에 검사할 수 있도록 원문도 보존한다.
  const originalName = asText(shop?.name) ?? asText(ld?.name) ?? asText(og.title) ?? "";
  const restrictionLabels = [
    ...(raw.restrictionLabels ?? []),
    ...(isRestrictedProduct(originalName) ? [originalName] : []),
  ].filter(Boolean);

  return {
    hasFailed,
    values: {
      name,
      ...(restrictionLabels.length ? { restrictionLabels } : {}),
      brand: truncate(
        asText(shop?.brand) ??
          asText(ld?.brand) ??
          asText(og.brand) ??
          asText(raw.md?.brand) ??
          asText(raw.eg?.brand),
        BRAND_MAX,
      ),
      price: price ?? "",
      // SAVE-003 리다이렉트를 따라간 최종 주소. 못 읽었으면 로그인·만료 페이지일 수 있어 원래 링크를 둔다.
      sourceUrl:
        hasFailed || !raw.finalUrl.startsWith("https://")
          ? fallbackUrl
          : stripTrackingParams(toMobileSmartStoreUrl(raw.finalUrl), true),
      // JSON-LD 상품 이미지는 상품명이 없어도 그 상품 것이라 쓴다. og:image는 상품명을 못 읽은 페이지에선
      // 사이트 로고일 때가 많고 저장 후 못 바꾸니(PDT-006) 쓰지 않는다.
      thumbnailUrl: toHttpsImage(ld?.image) ?? (hasFailed ? null : toHttpsImage(og.image)),
      wishLevel: null,
    },
  };
}
