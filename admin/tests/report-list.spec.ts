import { expect, test } from "@playwright/test";

const ALL_TITLES = [
  "게시글 #30",
  "댓글 #112",
  "게시글 #11",
  "게시글 #10",
  "댓글 #98",
  "게시글 #7",
  "댓글 #64",
  "게시글 #5",
];
const CASES = [
  { path: "reports", titles: ALL_TITLES, tab: "전체8" },
  { path: "reports-received", titles: ["게시글 #30", "게시글 #11", "게시글 #10"], tab: "접수3" },
  { path: "reports-reviewing", titles: ["댓글 #112", "댓글 #98"], tab: "검토 중2" },
  { path: "reports-resolved", titles: ["게시글 #7", "게시글 #5"], tab: "처리 완료2" },
  { path: "reports-rejected", titles: ["댓글 #64"], tab: "반려1" },
  {
    path: "reports-posts",
    titles: ["게시글 #30", "게시글 #11", "게시글 #10", "게시글 #7", "게시글 #5"],
    tab: "전체8",
    type: "게시글",
  },
  {
    path: "reports-comments",
    titles: ["댓글 #112", "댓글 #98", "댓글 #64"],
    tab: "전체8",
    type: "댓글",
  },
  { path: "reports-search", titles: ["게시글 #30", "게시글 #7"], tab: "전체8", search: "디깅" },
  { path: "reports-type-open", titles: ALL_TITLES, tab: "전체8", type: "전체 유형", isOpen: true },
  {
    path: "reports-posts-type-open",
    titles: ["게시글 #30", "게시글 #11", "게시글 #10", "게시글 #7", "게시글 #5"],
    tab: "전체8",
    type: "게시글",
    isOpen: true,
  },
  {
    path: "reports-comments-type-open",
    titles: ["댓글 #112", "댓글 #98", "댓글 #64"],
    tab: "전체8",
    type: "댓글",
    isOpen: true,
  },
];

for (const design of CASES) {
  test(`Figma 신고 목록 상태 ${design.path}`, async ({ page }) => {
    await page.goto(`/#/designs/${design.path}`);
    await expect(page.locator(".report-row__title > span:last-child")).toHaveText(design.titles);
    const tabs = page.getByRole("group", { name: "신고 상태 필터" });
    await expect(tabs.getByRole("button")).toHaveText([
      "전체8",
      "접수3",
      "검토 중2",
      "처리 완료2",
      "반려1",
    ]);
    await expect(tabs.getByRole("button", { pressed: true })).toHaveText(design.tab);
    await expect(page.locator(".report-table__footer")).toContainText(
      `${design.titles.length}건 표시 중`,
    );
    const type = page.getByRole("combobox", { name: "콘텐츠 유형" });
    await expect(type).toHaveText(design.type ?? "전체 유형");
    await expect(type).toHaveAttribute("aria-expanded", String(design.isOpen ?? false));
    if (design.isOpen) {
      await expect(page.getByRole("option", { selected: true })).toHaveText(design.type!);
      await expect(page.getByRole("listbox")).toHaveCSS("width", "160px");
      await expect(page.getByRole("listbox")).toHaveCSS("height", "126px");
      const selectedIcon = page.getByRole("option", { selected: true }).locator(".admin-icon");
      await expect(selectedIcon).toHaveCSS("width", "16px");
      await expect(selectedIcon).toHaveCSS("height", "16px");
    }
    if (design.search)
      await expect(page.getByRole("searchbox", { name: "신고 검색" })).toHaveValue(design.search);
  });
}

test("유형 메뉴는 선택·재선택·Escape·배경 닫기와 키보드 탐색을 지원한다", async ({ page }) => {
  await page.goto("/#/designs/reports");
  const combo = page.getByRole("combobox", { name: "콘텐츠 유형" });
  await combo.click();
  await page.getByRole("option", { name: "게시글", exact: true }).click();
  await expect(page.locator(".report-row")).toHaveCount(5);
  await expect(combo).toBeFocused();
  await combo.press("Enter");
  await expect(page.getByRole("option", { selected: true })).toHaveText("게시글");
  await combo.press("End");
  await combo.press("Escape");
  await expect(combo).toHaveText("게시글");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await combo.press("Enter");
  await combo.press("ArrowDown");
  await combo.press("Enter");
  await expect(combo).toHaveText("댓글");
  await expect(page.locator(".report-row")).toHaveCount(3);
  await combo.press("Home");
  await combo.press("Tab");
  await expect(combo).toHaveText("전체 유형");
  await expect(page.locator(".report-row")).toHaveCount(8);
  await combo.click();
  await page.getByRole("button", { name: "유형 선택 닫기" }).click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("검색 지우기와 상태·유형 조합은 전체 건수 표시를 바꾸지 않는다", async ({ page }) => {
  await page.goto("/#/designs/reports-search");
  const search = page.getByRole("searchbox", { name: "신고 검색" });
  await expect(page.locator(".report-row")).toHaveCount(2);
  await page.getByRole("button", { name: "검색어 지우기" }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(page.locator(".report-row")).toHaveCount(8);
  await page
    .getByRole("group", { name: "신고 상태 필터" })
    .getByRole("button", { name: /^검토 중/ })
    .click();
  await page.getByRole("combobox", { name: "콘텐츠 유형" }).click();
  await page.getByRole("option", { name: "댓글", exact: true }).click();
  await search.fill("링크왕");
  await expect(page.locator(".report-row__title > span:last-child")).toHaveText(["댓글 #98"]);
  await expect(page.getByRole("group", { name: "신고 상태 필터" }).getByRole("button")).toHaveText([
    "전체8",
    "접수3",
    "검토 중2",
    "처리 완료2",
    "반려1",
  ]);
  await search.fill("검색 결과 없음");
  await expect(page.getByText("조건에 맞는 신고가 없습니다.")).toBeVisible();
  await expect(page.locator(".report-table__footer")).toContainText("0건 표시 중");
});

test("유형 메뉴는 표 영역에 잘리지 않고 창 크기 변경 후에도 트리거에 붙어 있다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1139 });
  await page.goto("/#/designs/reports-type-open");
  const combo = page.getByRole("combobox", { name: "콘텐츠 유형" });
  const list = page.getByRole("listbox");
  const before = await combo.boundingBox();
  const popup = await list.boundingBox();
  expect(Math.abs(popup!.x + popup!.width - before!.x - before!.width)).toBeLessThan(1);
  expect(Math.abs(popup!.y - before!.y - before!.height - 6)).toBeLessThan(1);
  await page.setViewportSize({ width: 1280, height: 960 });
  const clamped = await list.boundingBox();
  expect(clamped!.x + clamped!.width).toBeLessThanOrEqual(1272);
  await combo.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => {
      const anchor = await combo.boundingBox();
      const bounds = await list.boundingBox();
      return Math.abs(bounds!.x + bounds!.width - anchor!.x - anchor!.width);
    })
    .toBeLessThan(1);
  await page.getByRole("option", { name: "댓글", exact: true }).click();
  await expect(page.locator(".report-row")).toHaveCount(3);
});
