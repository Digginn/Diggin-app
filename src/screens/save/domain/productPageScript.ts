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
 * 숨긴 WebView에 넣어 실행한다. 문자열이라 타입 검사를 못 받으니 판단은 하지 않고 재료만 모은다.
 * 상품명과 이미지가 잡히면 바로, 못 잡으면 PRODUCT_PAGE_WAIT_MS가 지나서 그때까지 모은 값을 보낸다.
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

  const readShop = () => {
    const naver = window.__PRELOADED_STATE__ && window.__PRELOADED_STATE__.simpleProductForDetailPage;
    if (naver && naver.name) {
      return {
        name: naver.dispName || naver.name,
        brand: (naver.naverShoppingSearchInfo && naver.naverShoppingSearchInfo.brandName) || null,
        price: (naver.benefitsView && naver.benefitsView.discountedSalePrice) ?? naver.salePrice ?? null,
      };
    }
    const next = document.getElementById("__NEXT_DATA__");
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

  const isAppLinkLanding = /(^|\\.)(airbridge\\.io|abr\\.ge|onelink\\.me|app\\.link|page\\.link)$|^applink\\./i.test(location.hostname);
  const startedAt = Date.now();
  let timer = null;
  const tick = () => {
    let raw;
    try { raw = read(); } catch (error) { return false; }
    const name = (raw.shop && raw.shop.name) || (raw.ld && raw.ld.name) || raw.og.title;
    const image = (raw.ld && raw.ld.image) || raw.og.image;
    if ((isAppLinkLanding || !(name && image)) && Date.now() - startedAt < ${PRODUCT_PAGE_WAIT_MS}) return false;
    if (timer) clearInterval(timer);
    window.ReactNativeWebView.postMessage(JSON.stringify(raw));
    return true;
  };
  if (!tick()) timer = setInterval(tick, 500);
  true;
})();`;
