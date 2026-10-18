/** 상품 페이지 안에서 모은 재료. 무엇을 쓸지는 normalizeProductPage가 정한다. */
export type ProductPageRaw = {
  finalUrl: string;
  og: {
    title: string | null;
    image: string | null;
    url: string | null;
    siteName: string | null;
    brand: string | null;
    price: string | null;
    currency: string | null;
  };
  ld: {
    name: string | null;
    brand: string | null;
    image: string | null;
    price: string | number | null;
    currency: string | null;
  } | null;
  // 공개 메타가 부정확한 쇼핑몰만 페이지 데이터에서 읽는다. 원화 판매처라 통화는 따로 두지 않는다.
  shop: { name: string | null; brand: string | null; price: number | null } | null;
};

export const PRODUCT_PAGE_WAIT_MS = 8000;

/**
 * 앱 공유 링크가 거치는 앱 연결 업체(Airbridge·AppsFlyer·Branch·Firebase) 중간 페이지의 호스트.
 * 페이지 스크립트와 normalizeProductPage가 같이 쓴다.
 */
export const APP_LINK_HOST =
  /(^|\.)(airbridge\.io|abr\.ge|onelink\.me|app\.link|page\.link)$|^applink\.|^kurlink\.kurly\.com$/i;
// 중간 페이지 주소에 담긴 웹 대체 주소. Airbridge·AppsFlyer·Branch 순.
const WEB_FALLBACK_PARAMS = [
  "fallback_mobile",
  "fallback_desktop",
  "af_web_dp",
  "$fallback_url",
  "$desktop_url",
];
// 에이블리처럼 가격·브랜드 메타를 화면을 그린 뒤에 붙이는 쇼핑몰이 있어, 상품명·이미지가 잡혀도 가격을 잠깐 더 기다린다.
export const PRODUCT_PAGE_PRICE_GRACE_MS = 2500;

/**
 * 숨긴 WebView가 페이지를 열기 시작할 때 넣어 실행한다(injectedJavaScriptBeforeContentLoaded).
 * 메타는 HTML 앞부분에 있어 이미지까지 다 받을 때를 기다리지 않고, 문서만 다 읽히면 판단한다. 문자열이라 타입 검사를 못 받으니 판단은 하지 않고 재료만 모은다.
 * 상품명·이미지·가격이 잡히면 바로 보낸다. 가격만 없으면 PRODUCT_PAGE_PRICE_GRACE_MS 더 기다리고,
 * 상품명·이미지도 못 잡으면 PRODUCT_PAGE_WAIT_MS가 지나서 그때까지 모은 값을 보낸다.
 * 앱 공유 링크는 앱 연결 업체(Airbridge 등)의 중간 페이지를 거친다. 거기서도 제목·이미지가 보이지만 가격이 없고
 * 곧 상품 페이지로 넘어가므로, 중간 페이지에서는 끝내지 않고 다음 페이지에서 새로 읽는다.
 */
export const PRODUCT_PAGE_SCRIPT = `(() => {
  const meta = (key) =>
    document.querySelector('meta[property="' + key + '"], meta[name="' + key + '"]')?.getAttribute("content")?.trim() || null;

  const readLd = () => {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent);
        const list = Array.isArray(data) ? data : data["@graph"] || [data];
        const product = list.find((item) => [].concat(item["@type"]).includes("Product"));
        if (!product) continue;
        const offer = [].concat(product.offers || [])[0] || {};
        return {
          name: product.name || null,
          brand: (product.brand && (product.brand.name || product.brand)) || null,
          image: ((image) => (image && (image.url || image.contentUrl)) || image || null)(
            [].concat(product.image || [])[0],
          ),
          price: offer.price ?? offer.lowPrice ?? null,
          currency: offer.priceCurrency || null,
        };
      } catch (error) {}
    }
    return null;
  };

  // 올리브영은 공개 메타에 가격·브랜드가 없고, 추천 서비스용 eg: 메타를 페이지가 뜬 뒤 늦게 붙인다.
  const isOliveYoung = location.hostname.endsWith("oliveyoung.co.kr");
  const readShop = () => {
    if (isOliveYoung) {
      const brand = meta("eg:brandName");
      // 정가(eg:originalPrice)가 아니라 지금 파는 값을 쓴다.
      const price = meta("eg:salePrice");
      return brand || price ? { name: null, brand, price } : null;
    }
    const naver = window.__PRELOADED_STATE__ && window.__PRELOADED_STATE__.simpleProductForDetailPage;
    if (naver && naver.name) {
      return {
        name: naver.dispName || naver.name,
        brand: (naver.naverShoppingSearchInfo && naver.naverShoppingSearchInfo.brandName) || null,
        price: (naver.benefitsView && naver.benefitsView.discountedSalePrice) ?? naver.salePrice ?? null,
      };
    }
    const next = document.getElementById("__NEXT_DATA__");
    // 오늘의집은 공개 메타에 브랜드가 없어 페이지 데이터에서 브랜드만 읽는다. 상품명·가격은 공개 메타가 정확하다.
    if (location.hostname.endsWith("ohou.se") && next) {
      try {
        const queries = JSON.parse(next.textContent).props.pageProps.dehydratedState.queries;
        const data = queries.map((query) => query.state.data).find((item) => item && item.production);
        if (data) return { name: null, brand: data.production.brandName || null, price: null };
      } catch (error) {}
    }
    // 4910은 공개 메타에 가격·브랜드가 없고 제목에 브랜드·사이트 문구가 붙는다. 판매처(market)는 브랜드가 없을 때만 쓴다.
    if (location.hostname.endsWith("4910.kr") && next) {
      try {
        const queries = JSON.parse(next.textContent).props.serverQueryClient.queries;
        const goods = queries.map((query) => query.state.data && query.state.data.goods).find(Boolean);
        if (goods) {
          return {
            name: goods.name || null,
            brand: (goods.brand && goods.brand.name) || (goods.market && goods.market.name) || null,
            price: goods.price ?? null,
          };
        }
      } catch (error) {}
    }
    if (location.hostname.endsWith("zigzag.kr") && next) {
      try {
        const queries = JSON.parse(next.textContent).props.pageProps.dehydratedState.queries;
        const data = queries.map((query) => query.state.data).find((item) => item && item.product);
        if (data) {
          const price = data.product.product_price;
          return {
            name: data.product.name || null,
            brand: (data.shop && data.shop.name) || null,
            price: (price && price.display_final_price && price.display_final_price.final_price.price) ?? null,
          };
        }
      } catch (error) {}
    }
    return null;
  };

  const read = () => ({
    finalUrl: location.href,
    og: {
      title: meta("og:title"),
      image: meta("og:image"),
      url: meta("og:url"),
      siteName: meta("og:site_name"),
      brand: meta("product:brand"),
      price: meta("product:price:amount") || meta("og:price:amount"),
      currency: meta("product:price:currency") || meta("og:price:currency"),
    },
    ld: readLd(),
    shop: readShop(),
  });

  const isAppLinkLanding = ${APP_LINK_HOST}.test(location.hostname);
  // 중간 페이지가 웹으로 넘겨 주지 않는 경우(오늘의집)가 있어, 주소에 담긴 웹 대체 주소로 직접 옮긴다.
  if (isAppLinkLanding) {
    // 컬리 공유 링크는 앱을 열거나 App Store로 보내고, 웹 대체 주소를 쿼리에 담지 않는다. 같은 상품 번호의 웹 주소로 옮긴다.
    const kurlyProduct = /^\\/products\\/(\\d+)/.exec(location.pathname);
    if (location.hostname === "kurlink.kurly.com" && kurlyProduct) {
      location.replace("https://www.kurly.com/goods/" + kurlyProduct[1]);
      return;
    }
    const params = new URLSearchParams(location.search);
    const fallback = ${JSON.stringify(WEB_FALLBACK_PARAMS)}.map((key) => params.get(key)).find((url) => url && /^https:\\/\\//i.test(url));
    if (fallback) {
      location.replace(fallback);
      return;
    }
  }
  const startedAt = Date.now();
  let timer = null;
  let foundAt = null;
  const tick = () => {
    let raw;
    try { raw = read(); } catch (error) { return false; }
    const name = (raw.shop && raw.shop.name) || (raw.ld && raw.ld.name) || raw.og.title;
    const image = (raw.ld && raw.ld.image) || raw.og.image;
    const price = (raw.shop && raw.shop.price) ?? (raw.ld && raw.ld.price) ?? raw.og.price;
    const now = Date.now();
    // 올리브영은 eg: 메타가 붙기 전에 찾았다고 보면 가격 대기 시간이 먼저 끝나 버린다.
    const isShopDataPending = isOliveYoung && !raw.shop;
    if (name && image && !isAppLinkLanding && !isShopDataPending && foundAt === null) foundAt = now;
    const isComplete = foundAt !== null && (price !== null && price !== undefined || now - foundAt >= ${PRODUCT_PAGE_PRICE_GRACE_MS});
    // __NEXT_DATA__ 같은 페이지 데이터는 문서 끝에 있어 문서를 다 읽기 전에는 끝내지 않는다.
    const isParsed = document.readyState !== "loading";
    if (!(isComplete && isParsed) && now - startedAt < ${PRODUCT_PAGE_WAIT_MS}) return false;
    if (timer) clearInterval(timer);
    window.ReactNativeWebView.postMessage(JSON.stringify(raw));
    return true;
  };
  if (!tick()) timer = setInterval(tick, 500);
})();
true;`;
