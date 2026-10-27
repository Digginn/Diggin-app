/** PC 주소 진입 시 오류가 나는 상품도 모바일 상세에서는 읽을 수 있다. 상품 경로만 바꾼다. */
export const toMobileSmartStoreUrl = (url: string) =>
  url.replace(
    /^https:\/\/smartstore\.naver\.com(?=\/[^/?#]+\/products\/\d+(?:[/?#]|$))/i,
    "https://m.smartstore.naver.com",
  );
