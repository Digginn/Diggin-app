import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
});

test("필터와 상태 선택은 각 예시에서 독립적으로 변경된다", async ({ page }) => {
  const filters = page.getByRole("group", { name: "신고 상태 필터" });
  await expect(filters.first().getByRole("button", { pressed: true })).toHaveText("전체18");
  await filters.first().getByRole("button", { name: "검토 중" }).click();
  await expect(filters.first().getByRole("button", { pressed: true })).toHaveText("검토 중4");
  await expect(filters.nth(1).getByRole("button", { pressed: true })).toHaveText("접수7");

  const segments = page.getByRole("group", { name: "신고 상태 변경" });
  await segments.first().getByRole("button", { name: "처리 완료" }).click();
  await expect(segments.first().getByRole("button", { pressed: true })).toHaveText("처리 완료");
});

test("제재는 하나만 선택되며 같은 카드를 다시 누르면 해제된다", async ({ page }) => {
  const group = page.getByRole("group", { name: "작성자 제재 선택" }).first();
  await expect(group.getByRole("button", { pressed: true })).toHaveCount(0);
  await group.getByRole("button", { name: "경고", exact: false }).click();
  await expect(group.getByRole("button", { pressed: true })).toHaveCount(1);
  const suspension = group.getByRole("button", { name: "계정 이용 정지", exact: false });
  await suspension.click();
  await expect(suspension).toHaveAttribute("aria-pressed", "true");
  await expect(group.getByRole("button", { pressed: true })).toHaveCount(1);
  await expect(suspension).toHaveCSS("background-color", "rgb(253, 236, 236)");
  await suspension.click();
  await expect(group.getByRole("button", { pressed: true })).toHaveCount(0);
});

test("숨기기와 복구하기가 왕복 전환된다", async ({ page }) => {
  const section = page.getByRole("region", { name: "VisibilityControl" });
  const first = section.locator(".visibility-control").first();
  await first.getByRole("button", { name: "숨기기" }).click();
  await expect(first).toContainText("숨김 처리됨");
  await first.getByRole("button", { name: "복구하기" }).click();
  await expect(first).toContainText("공개 중");
});

test("조치 사유는 200자로 제한되고 한글 입력 중에도 카운터가 갱신된다", async ({ page }) => {
  const input = page.getByRole("textbox", { name: "조치 사유", exact: true });
  await input.fill("가".repeat(199));
  await input.press("End");
  await input.pressSequentially("ab");
  await expect(input).toHaveValue("가".repeat(199) + "a");
  await expect(input.locator("..")).toContainText("200/200");
  await input.fill("");
  await input.dispatchEvent("compositionstart");
  await input.fill("조치 사유");
  await input.dispatchEvent("compositionend", { data: "유" });
  await expect(input).toHaveValue("조치 사유");
  await expect(input.locator("..")).toContainText("5/200");
});

test("비활성 버튼과 키보드 조작, 토스트 2.5초 닫힘을 지원한다", async ({ page }) => {
  const buttons = page.getByRole("region", { name: "AdminBtn", exact: true });
  await expect(buttons.getByRole("button", { disabled: true })).toHaveCount(2);
  await buttons.getByRole("checkbox", { name: "아이콘 표시" }).check();
  await expect(buttons.locator(".admin-icon")).toHaveCount(10);
  await expect(buttons.locator(".admin-btn--m .admin-icon").first()).toHaveCSS("width", "20px");
  await expect(buttons.locator(".admin-btn--s .admin-icon").first()).toHaveCSS("width", "16px");
  const toastButton = page.getByRole("button", { name: "토스트 표시" });
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await toastButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("조치를 적용했어요.");
  await page.clock.fastForward(2400);
  await expect(page.getByRole("status")).toBeVisible();
  await toastButton.click();
  await page.clock.fastForward(2400);
  await expect(page.getByRole("status")).toBeVisible();
  await page.clock.fastForward(100);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("신고 행과 아이콘이 원본 치수로 표시되고 작은 화면에서는 행 영역만 스크롤된다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const row = page.getByRole("button", { name: "게시글 #30 신고 상세 보기" }).first();
  await expect(row).toHaveCSS("width", "1128px");
  await expect(row).toHaveCSS("height", "89px");
  const segment = page.getByRole("group", { name: "신고 상태 변경" }).first();
  await expect(segment).toHaveCSS("width", "392px");
  await expect(segment).toHaveCSS("height", "44px");
  await expect(page.locator(".preview-icon-strip .admin-icon")).toHaveCount(19);
  await expect(page.locator(".admin-wordmark").first()).toHaveJSProperty("naturalWidth", 80);

  expect(await page.evaluate(() => document.fonts.check("600 14px Pretendard"))).toBeTruthy();
  // CSS 마스크와 img 모두 원본 SVG 응답을 검사한다. Vite의 인라인 data URL도 포함한다.
  const assets = await page
    .locator(".admin-icon, .admin-svg")
    .evaluateAll((elements) => [
      ...new Set(
        elements
          .map((element) =>
            element instanceof HTMLImageElement
              ? element.src
              : getComputedStyle(element).maskImage.slice(5, -2),
          )
          .filter((value) => value !== "none"),
      ),
    ]);
  expect(assets.length).toBeGreaterThanOrEqual(25);
  const results = await page.evaluate(
    async (urls) =>
      Promise.all(
        urls.map(async (url) => {
          const response = await fetch(url);
          return response.ok && (await response.text()).includes("<svg");
        }),
      ),
    assets,
  );
  expect(results.every(Boolean)).toBeTruthy();
  await row.hover();
  await expect(row).toHaveCSS("background-color", "rgb(249, 249, 249)");
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("게시글 #30을 선택했어요.");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await expect(row).toHaveCSS("width", "1128px");
  expect(errors).toEqual([]);
});
