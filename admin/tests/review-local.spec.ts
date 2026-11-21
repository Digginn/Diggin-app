import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email = "admin@diggin.local") {
  await page.goto("/#/login");
  await page.getByRole("textbox", { name: "이메일", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호", exact: true }).fill("LocalReview!224");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
}

test("머지 전 로컬 Auth로 로그인하고 실제 목록·회원·제재를 조회한다", async ({ page }) => {
  await login(page);
  await expect(page.getByText("로컬 검증 · 예시 데이터", { exact: false })).toBeVisible();
  await expect(page.locator(".report-row")).toHaveCount(4);
  await page.reload();
  await expect(page.locator(".report-row")).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: test.info().outputPath("local-review-reports.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "회원 관리" }).click();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(4);
  await page.getByRole("link", { name: "제재 이력" }).click();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1);
});

test("로컬의 실제 콘텐츠를 숨김·복구하고 신고 그룹을 검토 중으로 변경한다", async ({ page }) => {
  await login(page);
  await page
    .locator(".report-row")
    .filter({ has: page.locator(".status-badge", { hasText: "접수" }) })
    .click();
  await page.getByRole("textbox", { name: "조치 사유", exact: true }).fill("로컬 실제 숨김 검증");
  await page.getByRole("button", { name: "숨기기", exact: true }).click();
  await expect(page.getByRole("button", { name: "복구하기", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "조치 사유", exact: true }).fill("로컬 실제 복구 검증");
  await page.getByRole("button", { name: "복구하기", exact: true }).click();
  await expect(page.getByRole("button", { name: "숨기기", exact: true })).toBeVisible();
  await page
    .getByRole("group", { name: "신고 상태 변경" })
    .getByRole("button", { name: "검토 중", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "조치 사유", exact: true })
    .fill("로컬 실제 상태 변경 검증");
  await page.getByRole("button", { name: "조치 적용", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "적용하기" }).click();
  await expect(page.locator(".detail-header .status-badge")).toHaveText("검토 중");
  await expect(
    page.getByRole("region", { name: "신고 내역", exact: true }).locator(".status-badge"),
  ).toHaveText(["검토 중", "검토 중"]);
});

test("실제 Auth 제재·해제를 적용하고 최신 계정 상태를 확인한다", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "게시글 #1 신고 상세 보기", exact: true }).click();
  await page
    .getByRole("group", { name: "작성자 제재 선택" })
    .getByRole("button", { name: /^경고/ })
    .click();
  await page.getByRole("textbox", { name: "조치 사유", exact: true }).fill("로컬 실제 경고 검증");
  await page.getByRole("button", { name: "조치 적용", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "적용하기" }).click();
  await expect(page.locator(".detail-author__info")).toContainText("경고");
  await page
    .getByRole("group", { name: "작성자 제재 선택" })
    .getByRole("button", { name: /^제재 해제/ })
    .click();
  await page.getByRole("textbox", { name: "조치 사유", exact: true }).fill("로컬 실제 해제 검증");
  await page.getByRole("button", { name: "조치 적용", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "적용하기" }).click();
  await expect(page.locator(".detail-author__info")).toContainText("정상 이용");
});

test("일반 회원은 실제 로컬 관리자 API에서 차단된다", async ({ page }) => {
  await login(page, "author@diggin.local");
  await expect(page.getByRole("alert")).toContainText("관리자 권한이 없습니다");
  await expect(page.locator(".report-row")).toHaveCount(0);
});
