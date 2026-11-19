import * as amplitude from "@amplitude/analytics-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/lib/supabase";

const API_KEY = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY;
const OPTIONS = {
  // 일부만 넘기면 나머지가 꺼져 SDK 기본값을 모두 적는다. 개인정보처리방침에 적은 값만 보낸다.
  // 광고 식별자(MY-010)·IP 주소와 위치는 수집하지 않고, 기기는 device_id로 구분해 IDFV·앱 세트 ID도 보내지 않는다.
  trackingOptions: {
    adid: false,
    carrier: true,
    deviceManufacturer: true,
    deviceModel: true,
    ipAddress: false,
    language: true,
    osName: true,
    osVersion: true,
    platform: true,
    appSetId: false,
    idfv: false,
    country: false,
  },
};

export type AnalyticsConsent = { usage_analysis: boolean; overseas_transfer: boolean };

// 키가 없는 빌드와 두 선택 동의를 모두 하지 않은 회원·비회원은 SDK를 켜지 않아 아무것도 보내지 않는다(#156).
let client: ReturnType<typeof amplitude.createInstance> | null = null;
let clientUserId: string | null = null;
// 지금 로그인한 회원. 이전 계정의 늦은 동의 저장 응답이 분석을 다시 켜거나 사용자를 바꾸지 못하게 한다.
let sessionUserId: string | null = null;
let revision = 0;

// SDK 내부 전송 플러그인. 철회할 때 예약된 전송과 메모리 대기열을 직접 비우려고 쓴다.
type Destination = {
  name: string;
  queue?: unknown[];
  scheduleId?: ReturnType<typeof setTimeout> | null;
  resetSchedule?: () => void;
  saveEvents?: () => void;
};

function start(userId: string) {
  if (!API_KEY) return;
  if (client) {
    if (clientUserId !== userId) client.setUserId(userId);
  } else {
    client = amplitude.createInstance();
    // 철회·로그아웃 때 저장된 optOut이 새 인스턴스에 되살아나지 않게 다시 동의한 시점에 푼다.
    client.init(API_KEY, userId, { ...OPTIONS, optOut: false });
  }
  clientUserId = userId;
}

/** 철회·로그아웃 즉시 멈춘다. 예약된 전송과 메모리·저장소의 미전송 이벤트도 지워 철회 뒤에 보내지 않는다. */
function stop() {
  if (!client || !API_KEY) return;
  client.setOptOut(true);
  // shortcut: SDK가 대기열 비우기 API를 주지 않아 내부 전송 플러그인의 타이머·대기열을 직접 비운다, SDK를 올릴 때 이 구조를 다시 확인한다.
  const timeline = (
    client as unknown as {
      timeline?: { queue?: unknown[]; plugins?: Destination[] };
    }
  ).timeline;
  const destination = timeline?.plugins?.find((plugin) => plugin.name === "amplitude");
  if (destination) {
    if (destination.scheduleId) clearTimeout(destination.scheduleId);
    destination.resetSchedule?.();
    destination.queue = [];
    destination.saveEvents?.();
  }
  if (timeline) timeline.queue = [];
  // 다음 회원과 섞이지 않게 기기 식별값도 새로 만든다.
  client.reset();
  void client.remove("amplitude");
  client = null;
  clientUserId = null;
  void AsyncStorage.removeItem(`AMP_unsent_${API_KEY.slice(0, 10)}`).catch(() => {});
}

/** 설정·로그인 동의 저장 성공 뒤 바로 반영한다. 그사이 로그아웃했거나 다른 계정이면 무시한다. */
export function applyAnalyticsConsent(userId: string, consent: AnalyticsConsent) {
  if (userId !== sessionUserId) return;
  // 방금 저장한 동의가 그 전에 시작한 조회 결과로 덮이지 않게 한다.
  revision++;
  if (consent.usage_analysis === true && consent.overseas_transfer === true) start(userId);
  else stop();
}

/** 로그인 상태가 바뀌거나 앱으로 돌아올 때 서버의 동의를 다시 읽는다. 운영자가 바꾼 철회도 이때 반영한다. */
export async function syncAnalyticsConsent(userId: string | null) {
  const current = ++revision;
  sessionUserId = userId;
  if (!userId || !API_KEY) {
    stop();
    return;
  }
  let consent: unknown = null;
  try {
    const { data, error } = await supabase.rpc("get_analytics_consent");
    if (!error) consent = data;
  } catch {
    // 연결 실패도 아래에서 확인하지 못한 것으로 처리한다.
  }
  if (current !== revision) return;
  if (consent && typeof consent === "object" && !Array.isArray(consent)) {
    applyAnalyticsConsent(userId, consent as AnalyticsConsent);
    return;
  }
  // 확인하지 못하면 켜지 않는다. 같은 회원으로 이미 켜져 있으면 다음 확인까지 그대로 둔다.
  if (clientUserId !== userId) stop();
}

export type EntryPoint = "direct" | "share";

/** ANA-001 이벤트 속성 시트에 정의된 16개 이벤트만 보낸다. */
type AnalyticsEvents = {
  signup_complete: { signup_method: "google" | "apple" | "kakao" };
  product_add_start: { entry_point: EntryPoint };
  product_add_complete: { entry_point: EntryPoint };
  product_edit: { product_id: string };
  product_delete: { product_id: string; delete_batch_id: string };
  folder_create: { folder_id: string };
  saved_product_view: {
    product_id: string;
    entry_point: "all" | "folder" | "search" | "already_saved";
  };
  wishlist_import_start: { import_job_id: string };
  wishlist_import_complete: {
    import_job_id: string;
    total_count: number;
    success_count: number;
    duplicate_count: number;
    fail_count: number;
    fail_reasons: string[];
    retry_count: number;
  };
  community_view: { view_type: "feed" } | { view_type: "post_detail"; post_id: string };
  post_create: { post_id: string };
  vote_create: { post_id: string };
  vote_participate: { post_id: string; vote_option: "buy" | "not" };
  comment_create: { post_id: string };
  community_product_save: { post_id: string; product_id: string };
  external_product_click: {
    product_id: string;
    click_source: "my_product" | "community_product";
  };
};

export function trackEvent<K extends keyof AnalyticsEvents>(
  name: K,
  properties: AnalyticsEvents[K],
) {
  client?.track(name, properties);
}

/** 공유 확장은 저장 직후 닫혀 모아 둔 이벤트를 보내기 전에 꺼질 수 있다. 오프라인이면 기다리지 않고 닫는다. */
export async function flushAnalytics(timeoutMs = 1000) {
  if (!client) return;
  await Promise.race([
    client.flush().promise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
