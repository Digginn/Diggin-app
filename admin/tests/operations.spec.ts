import { expect, test } from "@playwright/test";

import { MEMBER_ROWS, SANCTION_ROWS } from "../src/preview-data/operations";

test("제재 이력은 기존 기록 8개와 기간·처리·상태를 그대로 표시한다", async ({ page }) => {
  await page.goto("/#/designs/sanctions");
  const table = page.getByRole("table", { name: "제재 이력", exact: true });
  await expect(table.getByRole("columnheader")).toHaveText([
    "작성자",
    "제재",
    "사유 분류",
    "기간",
    "상태",
    "처리",
  ]);
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(8);
  for (const [index, [name, id, ...values]] of SANCTION_ROWS.entries()) {
    await expect(rows.nth(index).getByRole("cell")).toHaveText([name + id, ...values]);
  }
  await expect(table.locator(".operations-chip--danger")).toHaveText("진행 중");
  await expect(table.locator(".operations-chip--record")).toHaveCount(4);
  await expect(table.locator(".operations-chip--neutral")).toHaveText(["해제됨", "해제됨", "종료"]);
  await expect(table.getByRole("button")).toHaveCount(0);
});

test("회원 관리는 8명의 활동·신고·누적 제재와 계정 상태를 표시한다", async ({ page }) => {
  await page.goto("/#/designs/members");
  const table = page.getByRole("table", { name: "회원 관리", exact: true });
  await expect(table.getByRole("columnheader")).toHaveText([
    "회원",
    "가입일",
    "게시글·댓글",
    "받은 신고",
    "누적 제재",
    "계정 상태",
    "최근 접속",
  ]);
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(8);
  for (const [index, [name, id, ...values]] of MEMBER_ROWS.entries()) {
    await expect(rows.nth(index).getByRole("cell")).toHaveText([name + id, ...values]);
  }
  await expect(table.locator(".operations-chip--normal")).toHaveCount(7);
  await expect(table.locator(".operations-chip--danger")).toHaveText("계정 이용 정지");
});

test("목차와 사이드 메뉴에서 세 화면을 오가고 현재 메뉴와 미처리 건수를 유지한다", async ({
  page,
}) => {
  await page.goto("/#/designs");
  const index = page.getByRole("navigation", { name: "기타 메뉴와 새로고침 디자인 상태 선택" });
  await expect(index.getByRole("link")).toHaveCount(4);
  await index.getByRole("link", { name: "제재 이력 7068:143993" }).click();
  for (const title of ["회원 관리", "신고 관리", "제재 이력"]) {
    const sidebar = page.getByRole("complementary", { name: "관리자 내비게이션" });
    await sidebar.getByRole("link", { name: title, exact: title !== "신고 관리" }).click();
    await expect(page.locator('.nav-item[aria-current="page"]')).toContainText(title);
    await expect(page.locator(".nav-item__count")).toHaveText("5");
    await expect(page).toHaveURL(new RegExp("#/designs/"));
  }
});

test("미리보기 로그인 없이 제재·회원 화면에 접근하면 로그인 안내를 보인다", async ({ page }) => {
  for (const path of ["sanctions", "members"]) {
    await page.goto(`/#/preview/${path}`);
    await expect(page.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  }
  await page.getByLabel("이메일", { exact: true }).fill("preview@example.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("preview123");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("link", { name: "제재 이력", exact: true }).click();
  await expect(page).toHaveURL(/#\/preview\/sanctions$/);
  await page.getByRole("link", { name: "회원 관리", exact: true }).click();
  await expect(page).toHaveURL(/#\/preview\/members$/);
  await expect(page.getByRole("table", { name: "회원 관리", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("목록 새로고침은 필터를 유지하고 반복 클릭하면 토스트 표시 시간을 갱신한다", async ({
  page,
}) => {
  await page.goto("/#/designs/reports");
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await page.getByRole("searchbox", { name: "신고 검색" }).fill("디깅러버");
  const refresh = page.getByRole("button", { name: "새로고침", exact: true });
  await refresh.click();
  const toast = page.locator(".admin-toast--refresh");
  await expect(toast).toHaveText("목록을 새로고침했어요.");
  await expect(page.locator(".report-row")).toHaveCount(1);
  await page.clock.fastForward(2400);
  await refresh.click();
  await page.clock.fastForward(2400);
  await expect(toast).toBeVisible();
  await page.clock.fastForward(100);
  await expect(toast).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveValue("디깅러버");
});

test("상세 새로고침은 입력 초안·노출 상태·이력을 유지하고 후속 조치는 성공 아이콘을 쓴다", async ({
  page,
}) => {
  await page.goto("/#/designs/report-post-30-input");
  const reason = page.getByRole("textbox", { name: /조치 사유/ });
  await reason.fill("새로고침 이후에도 유지할 초안");
  const history = await page.locator(".history-item").allTextContents();
  await page.getByRole("button", { name: "상세 새로고침", exact: true }).click();
  await expect(page.locator(".admin-toast--refresh")).toHaveText("최신 정보로 새로고침했어요.");
  await expect(reason).toHaveValue("새로고침 이후에도 유지할 초안");
  expect(await page.locator(".history-item").allTextContents()).toEqual(history);
  await page.getByRole("button", { name: "숨기기", exact: true }).click();
  await expect(page.locator(".admin-toast--success")).toHaveText("콘텐츠를 숨겼어요.");
  await expect(page.locator(".history-item")).toHaveCount(history.length + 1);
  await page.getByRole("button", { name: "상세 새로고침", exact: true }).click();
  await expect(page.getByRole("button", { name: "복구하기", exact: true })).toBeVisible();
  await expect(page.locator(".history-item")).toHaveCount(history.length + 1);
});

for (const [path, message] of [
  ["reports-refresh", "목록을 새로고침했어요."],
  ["detail-refresh", "최신 정보로 새로고침했어요."],
]) {
  test(`${path} 토스트 직접 진입과 자동 닫힘`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
    await page.goto(`/#/designs/${path}`);
    await expect(page.getByRole("status")).toHaveText(message);
    await expect(page.locator(".admin-toast img")).toHaveAttribute("width", "16");
    await expect(page.locator(".admin-toast img")).toHaveAttribute("height", "16");
    await page.clock.fastForward(2500);
    await expect(page.getByRole("status")).toHaveCount(0);
  });
}

test("좁은 화면에서 제재·회원 표만 가로 스크롤하고 새로고침으로 행이 달라지지 않는다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of ["sanctions", "members"]) {
    await page.goto(`/#/designs/${view}`);
    const before = await page.locator("tbody").textContent();
    await page.getByRole("button", { name: "새로고침", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("목록을 새로고침했어요.");
    expect(await page.locator("tbody").textContent()).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    expect(
      await page
        .locator(".operations-table-scroll")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
    ).toBe(true);
  }
});
