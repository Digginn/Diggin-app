import * as amplitude from "@amplitude/analytics-react-native";

const API_KEY = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY;

// 키가 없는 빌드는 수집하지 않는다.
if (API_KEY)
  amplitude.init(API_KEY, undefined, {
    // 일부만 넘기면 나머지가 꺼져 SDK 기본값을 모두 적는다. 광고 식별자는 수집하지 않는다(MY-010).
    trackingOptions: {
      adid: false,
      carrier: true,
      deviceManufacturer: true,
      deviceModel: true,
      ipAddress: true,
      language: true,
      osName: true,
      osVersion: true,
      platform: true,
      appSetId: true,
      idfv: true,
      country: false,
    },
  });

export type EntryPoint = "direct" | "share";

/** ANA-001 이벤트 속성 시트에 정의된 15개 이벤트만 보낸다. */
type AnalyticsEvents = {
  signup_complete: { signup_method: "google" | "apple" | "kakao" };
  product_add_start: { entry_point: EntryPoint };
  product_add_complete: { entry_point: EntryPoint };
  product_edit: { product_id: string };
  product_delete: { product_id: string; delete_batch_id: string };
  folder_create: { folder_id: string };
  wishlist_import_start: { import_job_id: string };
  wishlist_import_complete: {
    import_job_id: string;
    total_count: number;
    success_count: number;
    duplicate_count: number;
    fail_count: number;
  };
  community_view: { view_type: "feed" } | { view_type: "post_detail"; post_id: string };
  post_create: { post_id: string };
  vote_create: { post_id: string };
  vote_participate: { post_id: string; vote_option: "buy" | "not" };
  comment_create: { post_id: string };
  community_product_save: { product_id: string };
  external_product_click: {
    product_id: string;
    click_source: "my_product" | "community_product";
  };
};

export function trackEvent<K extends keyof AnalyticsEvents>(
  name: K,
  properties: AnalyticsEvents[K],
) {
  if (API_KEY) amplitude.track(name, properties);
}

/** 공유 확장은 저장 직후 닫혀 모아 둔 이벤트를 보내기 전에 꺼질 수 있다. 오프라인이면 기다리지 않고 닫는다. */
export async function flushAnalytics(timeoutMs = 1000) {
  if (!API_KEY) return;
  await Promise.race([
    amplitude.flush().promise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** 로그인한 회원과 이벤트를 연결한다. 로그아웃하면 다음 계정과 섞이지 않게 기기 식별값도 새로 만든다. */
export function setAnalyticsUser(userId: string | null) {
  if (!API_KEY) return;
  if (userId) amplitude.setUserId(userId);
  else amplitude.reset();
}
