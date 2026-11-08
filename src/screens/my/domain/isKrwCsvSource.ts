const KRW_STORE_NAMES = new Set([
  "쿠팡",
  "무신사",
  "29cm",
  "지그재그",
  "네이버 스마트스토어",
  "kream",
  "ably",
  "4910",
]);

const KRW_STORE_DOMAINS = [
  "coupang.com",
  "musinsa.com",
  "29cm.co.kr",
  "zigzag.kr",
  "smartstore.naver.com",
  "kream.co.kr",
  "a-bly.com",
  "4910.kr",
];

/** IMP-005: 승인된 스토어명 또는 도메인(하위 도메인 포함)이면 원화로 판별한다. */
export function isKrwCsvSource({
  storeName,
  hostname,
}: {
  storeName: string;
  hostname: string;
}): boolean {
  const host = hostname.toLowerCase();
  return (
    KRW_STORE_NAMES.has(storeName.trim().toLowerCase()) ||
    KRW_STORE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))
  );
}
