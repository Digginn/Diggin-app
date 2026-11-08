import AsyncStorage from "@react-native-async-storage/async-storage";
import type { InfiniteData } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, type ViewToken } from "react-native";

import { folderKeys } from "@/api/folders";
import { fillProductImage, productKeys, type ProductDetail } from "@/api/products";
import { queryClient } from "@/lib/queryClient";
import { fetchProductMeta } from "@/screens/save/api/fetchProductMeta";
import { ProductPageReader } from "@/screens/save/components/ProductPageReader";
import { normalizeProductPage } from "@/screens/save/domain/normalizeProductPage";
import type { ProductPageRaw } from "@/screens/save/domain/productPageScript";
import { isRestrictedProduct } from "@/screens/save/domain/restrictedProduct";
import type { WishItem } from "@/types/wish-item";

// shortcut: 쇼핑몰별 하루 한도·간격은 실측 전 임시값이다. 쇼핑몰별 차단 기준을 재 보고 정한다.
const HOST_DAILY_LIMIT = 100;
const SAME_HOST_GAP_MS = 3000;
const DAILY_COUNT_KEY = "product-image-fill-count";
// 네이버는 HTML 요청을 429로 막는다. 목록에서는 읽지 않고 상세 화면을 열었을 때만 웹뷰로 읽는다.
const TAP_ONLY_HOST = /(^|\.)(smartstore|brand)\.naver\.com$|^naver\.me$/i;

type Job = { id: string; url: string };
type Candidate = Pick<WishItem, "id" | "imageSourceUrl">;

let queue: Job[] = [];
let tapped: Job | null = null;
// active는 지금 읽고 있는 상품, current는 그중 웹뷰로 여는 상품이다.
let active: Job | null = null;
let current: Job | null = null;
type Daily = { date: string; counts: Record<string, number>; blocked: string[] };

let daily: Daily | null = null;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
const attempted = new Set<string>();
const unreachable = new Set<string>();
const lastOpenedAt = new Map<string, number>();
const listeners = new Set<() => void>();

const hostOf = (url: string) => /^https?:\/\/([^/?#]+)/i.exec(url)?.[1] ?? "";
const today = () => new Date().toDateString();

function setCurrent(job: Job | null) {
  current = job;
  listeners.forEach((listener) => listener());
}

async function loadDaily() {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(DAILY_COUNT_KEY)) ?? "null");
    daily = saved?.date === today() ? { counts: {}, blocked: [], ...saved } : null;
  } catch {
    daily = null;
  }
  daily ??= { date: today(), counts: {}, blocked: [] };
}

function updateDaily(change: (value: Daily) => void) {
  if (daily?.date !== today()) daily = { date: today(), counts: {}, blocked: [] };
  change(daily);
  void AsyncStorage.setItem(DAILY_COUNT_KEY, JSON.stringify(daily)).catch(() => {});
}

// 차단 응답을 준 쇼핑몰은 그날, 연결이 안 되는 쇼핑몰은 이번 실행 동안 열지 않는다.
const isSkipped = (host: string) =>
  unreachable.has(host) || (daily?.date === today() && daily.blocked.includes(host));
const isOverLimit = (host: string) =>
  daily?.date === today() && (daily.counts[host] ?? 0) >= HOST_DAILY_LIMIT;

// 한 번에 한 상품만 읽고, 같은 쇼핑몰은 간격을 둔다. 쇼핑몰별 하루 한도를 넘으면 다음 날 화면에 다시 보일 때 연다.
function next() {
  if (active || (!tapped && queue.length === 0) || AppState.currentState !== "active") return;
  if (!daily) {
    void loadDaily().then(next);
    return;
  }
  if (tapped && isSkipped(hostOf(tapped.url))) tapped = null;
  // 사용자가 연 상세 화면은 페이지 한 번 여는 것과 같아 하루 한도와 관계없이 읽는다.
  queue = queue.filter((job) => !isSkipped(hostOf(job.url)) && !isOverLimit(hostOf(job.url)));
  const jobs = tapped ? [tapped, ...queue] : queue;
  if (jobs.length === 0) return;
  const now = Date.now();
  const waits = jobs.map(
    (job) => (lastOpenedAt.get(hostOf(job.url)) ?? 0) + SAME_HOST_GAP_MS - now,
  );
  const index = waits.findIndex((wait) => wait <= 0);
  if (index < 0) {
    wakeTimer ??= setTimeout(
      () => {
        wakeTimer = null;
        next();
      },
      Math.min(...waits),
    );
    return;
  }
  const job = jobs[index];
  if (job === tapped) tapped = null;
  queue = queue.filter((queued) => queued.id !== job.id);
  attempted.add(job.id);
  lastOpenedAt.set(hostOf(job.url), now);
  updateDaily((value) => {
    value.counts[hostOf(job.url)] = (value.counts[hostOf(job.url)] ?? 0) + 1;
  });
  active = job;
  void readFast(job);
}

/** 이미지를 못 찾으면 undefined, 링크 저장처럼 상품명·제한 표시가 제한 상품이면 이미지 없음(null)이다. */
function imageOf(raw: ProductPageRaw, url: string) {
  const { values } = normalizeProductPage(raw, url);
  if (isRestrictedProduct(values.name, values.restrictionLabels)) return null;
  return values.thumbnailUrl ?? undefined;
}

// HTML만으로 이미지를 찾으면 웹뷰를 띄우지 않는다. 못 찾으면 같은 상품을 웹뷰로 다시 읽는다.
async function readFast(job: Job) {
  const host = hostOf(job.url);
  const result = TAP_ONLY_HOST.test(host) ? null : await fetchProductMeta(job.url);
  const image = typeof result === "object" && result ? imageOf(result, job.url) : undefined;
  if (result === "gone") return finish(job, null);
  if (result === "blocked") {
    updateDaily((value) => {
      if (!value.blocked.includes(host)) value.blocked.push(host);
    });
    return finish(job, undefined);
  }
  if (result === "unreachable") {
    unreachable.add(host);
    return finish(job, undefined);
  }
  if (image !== undefined) return finish(job, image);
  setCurrent(job);
}

function patchCachedItem(id: string, thumbnailUrl: string | null) {
  const patch = (data: unknown) => {
    const pages = (data as InfiniteData<WishItem[]> | undefined)?.pages;
    if (!Array.isArray(pages)) return data;
    return {
      ...(data as InfiniteData<WishItem[]>),
      pages: pages.map((page) =>
        page.map((item) =>
          item.id === id ? { ...item, thumbnailUrl, imageSourceUrl: undefined } : item,
        ),
      ),
    };
  };
  queryClient.setQueriesData({ queryKey: productKeys.all }, patch);
  queryClient.setQueriesData({ queryKey: folderKeys.all }, patch);
  queryClient.setQueryData<ProductDetail>(
    productKeys.detail(id),
    (detail) =>
      detail && { ...detail, needsImage: false, values: { ...detail.values, thumbnailUrl } },
  );
  // 폴더 대표 이미지는 목록 조회에서 따로 가져와 다시 불러온다.
  if (thumbnailUrl) void queryClient.invalidateQueries({ queryKey: folderKeys.list() });
}

/** image가 undefined면 기록하지 않아 다음 실행 때 다시 연다. null은 이미지 없음으로 끝낸다. */
async function finish(job: Job, image: string | null | undefined) {
  try {
    if (image !== undefined) patchCachedItem(job.id, await fillProductImage(job.id, image));
  } catch (error) {
    console.warn("상품 이미지를 채우지 못했습니다.", error);
  } finally {
    active = null;
    setCurrent(null);
    next();
  }
}

/** 화면에 보이는 카드 중 이미지를 아직 읽지 않은 상품만 대기열에 둔다. 화면에서 사라진 상품은 뺀다. */
export function requestProductImages(items: readonly (Candidate | null)[]) {
  queue = items.flatMap((item) =>
    item?.imageSourceUrl &&
    !attempted.has(item.id) &&
    !TAP_ONLY_HOST.test(hostOf(item.imageSourceUrl))
      ? [{ id: item.id, url: item.imageSourceUrl }]
      : [],
  );
  next();
}

/** 상세 화면을 연 상품은 목록보다 먼저 읽는다. 네이버 상품은 이때만 읽는다. */
export function requestProductImageNow(id: string, url: string) {
  if (attempted.has(id) || active?.id === id) return;
  tapped = { id, url };
  next();
}

/** FlatList는 onViewableItemsChanged가 바뀌면 오류를 내므로 모듈에 하나만 둔다. */
export function onVisibleItemsChanged({
  viewableItems,
}: {
  viewableItems: ViewToken<Candidate | null>[];
}) {
  requestProductImages(viewableItems.map((token) => token.item));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** CSV로 가져온 상품의 이미지를 화면에 보이는 것부터 숨긴 웹뷰로 읽어 한 번만 채운다. */
export function ProductImageFiller() {
  const job = useSyncExternalStore(subscribe, () => current);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") next();
    });
    return () => subscription.remove();
  }, []);

  if (!job) return null;
  return (
    <ProductPageReader
      key={job.id}
      url={job.url}
      onDone={(raw) => void finish(job, raw ? (imageOf(raw, job.url) ?? null) : undefined)}
    />
  );
}
