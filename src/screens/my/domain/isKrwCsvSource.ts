// PM이 승인한 8개 판매처의 국내 쇼핑 호스트만 허용한다.
// 전체 하위 도메인을 허용하면 해외몰·제휴 링크까지 KRW로 잘못 판단할 수 있다.
const KRW_SHOP_HOSTS = new Set([
  "coupang.com",
  "www.coupang.com",
  "m.coupang.com",
  "musinsa.com",
  "www.musinsa.com",
  "m.musinsa.com",
  "store.musinsa.com",
  "29cm.co.kr",
  "www.29cm.co.kr",
  "m.29cm.co.kr",
  "shop.29cm.co.kr",
  "product.29cm.co.kr",
  "zigzag.kr",
  "www.zigzag.kr",
  "m.zigzag.kr",
  "smartstore.naver.com",
  "m.smartstore.naver.com",
  "kream.co.kr",
  "www.kream.co.kr",
  "m.kream.co.kr",
  "a-bly.com",
  "www.a-bly.com",
  "m.a-bly.com",
  "mobile.a-bly.com",
  "4910.kr",
  "www.4910.kr",
  "m.4910.kr",
]);

/** CSV 스토어명만으로 통화를 추측하거나 원본 링크의 redirect를 따라가지 않는다. */
export function isKrwCsvSource({ hostname }: { hostname: string }): boolean {
  return KRW_SHOP_HOSTS.has(hostname.toLowerCase());
}
