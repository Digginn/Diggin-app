import { expect, test } from "@playwright/test";

import type * as BrowserHarness from "./browser-harness";

test("디자인 상태 선택에서 로그인과 신고 목록 구역을 확인한다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "로그인 · 비로그인 · 로그아웃" })).toBeVisible();
  await expect(page.getByText("실제 계정과 연결되지 않은 미리보기입니다.")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "디자인 상태 선택", exact: true }).getByRole("link"),
  ).toHaveCount(7);
  await expect(
    page.getByRole("heading", { name: "신고 목록 · 상태 필터 · 유형 · 검색" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "신고 목록 디자인 상태 선택", exact: true })
      .getByRole("link"),
  ).toHaveCount(11);
  await expect(page.getByRole("heading", { name: "조치 후 신고 목록 (처리 반영)" })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "조치 후 신고 목록 디자인 상태 선택", exact: true })
      .getByRole("link"),
  ).toHaveCount(5);
  await page.getByRole("link", { name: "공통 컴포넌트 보기" }).click();
  await expect(page.getByRole("heading", { name: "관리자 컴포넌트", exact: true })).toBeVisible();
});

test("로그인 입력·비밀번호 표시·Enter 제출은 외부 전송이나 저장 없이 동작한다", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:")) externalRequests.push(request.url());
  });
  await page.goto("/#/designs/login");
  const submit = page.getByRole("button", { name: "로그인", exact: true });
  await expect(submit).toBeDisabled();
  await page.getByLabel("이메일", { exact: true }).fill("preview@example.com");
  const password = page.getByLabel("비밀번호", { exact: true });
  await password.fill("preview123");
  await expect(submit).toBeEnabled();
  await page.getByRole("button", { name: "비밀번호 표시", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "비밀번호 숨기기", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");
  await password.press("Enter");
  await expect(page.getByRole("heading", { name: "신고 목록", exact: true })).toBeVisible();
  await expect(page.locator(".report-row")).toHaveCount(8);
  expect(externalRequests).toEqual([]);
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 });
});

test("자격 증명 오류를 표시하고 재입력하면 오류를 지운다", async ({ page }) => {
  await page.goto("/#/designs/login-error");
  await expect(page.getByRole("alert")).toHaveText("이메일 또는 비밀번호가 일치하지 않습니다.");
  const password = page.getByLabel("비밀번호", { exact: true });
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".login-input--error")).toHaveCSS("border-color", "rgb(235, 37, 37)");
  await password.fill("another-preview");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(password).toHaveAttribute("aria-invalid", "false");
  await password.press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("이메일", { exact: true }).fill("invalid-email");
  await password.press("Enter");
  expect(
    await page
      .getByLabel("이메일", { exact: true })
      .evaluate((input) => (input as HTMLInputElement).validity.typeMismatch),
  ).toBe(true);
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
});

test("보호 화면의 비로그인 진입과 새로고침은 로그인 필요 상태로 돌아간다", async ({ page }) => {
  await page.goto("/#/preview/reports");
  await expect(page.getByRole("status")).toContainText("로그인이 필요합니다.");
  await page.getByLabel("이메일", { exact: true }).fill("preview@example.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("preview123");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("heading", { name: "신고 목록", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("status")).toContainText("로그인이 필요합니다.");
  await expect(page.locator(".report-row")).toHaveCount(0);
});

test("프로필 메뉴·모달은 Escape·바깥 클릭·취소와 포커스 복귀를 지원한다", async ({ page }) => {
  await page.goto("/#/designs/reports-profile");
  const profile = page.getByRole("button", { name: /프로필 메뉴/ });
  const logoutItem = page.getByRole("menuitem", { name: "로그아웃" });
  await expect(logoutItem).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(profile).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await profile.press("ArrowDown");
  await expect(logoutItem).toBeFocused();
  await page.getByRole("heading", { name: "신고 목록", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await profile.click();
  await logoutItem.click();
  const dialog = page.getByRole("dialog", { name: "로그아웃합니까?" });
  const cancel = dialog.getByRole("button", { name: "취소" });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "로그아웃", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(profile).toBeFocused();
  await profile.click();
  await logoutItem.click();
  await cancel.click();
  await expect(profile).toBeFocused();
  await profile.click();
  await logoutItem.click();
  await page.mouse.click(5, 5);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "신고 목록", exact: true })).toBeVisible();
});

test("로그아웃 확인은 입력을 초기화하고 상단 토스트를 2.5초 표시한다", async ({ page }) => {
  await page.goto("/#/designs/login-filled");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("button", { name: /프로필 메뉴/ }).click();
  await page.getByRole("menuitem", { name: "로그아웃" }).click();
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await page.getByRole("dialog").getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.getByLabel("이메일", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveValue("");
  await expect(page.getByRole("status")).toHaveText("로그아웃했어요.");
  await expect(page.locator(".auth-toast-position")).toHaveCSS("top", "32px");
  await page.clock.fastForward(2499);
  await expect(page.getByRole("status")).toBeVisible();
  await page.clock.fastForward(1);
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("status")).toContainText("로그인이 필요합니다.");
});

test("신고 필터·유형·검색·빈 결과가 예시 데이터에 적용된다", async ({ page }) => {
  await page.goto("/#/designs/reports-profile");
  await page.getByRole("heading", { name: "신고 목록", exact: true }).click();
  const filters = page.getByRole("group", { name: "신고 상태 필터" });
  await filters.getByRole("button", { name: /^접수/ }).click();
  await expect(page.locator(".report-row")).toHaveCount(3);
  await page.getByRole("combobox", { name: "콘텐츠 유형", exact: true }).click();
  await page.getByRole("option", { name: "댓글", exact: true }).click();
  await expect(page.getByText("조건에 맞는 신고가 없습니다.")).toBeVisible();
  await filters.getByRole("button", { name: /^전체/ }).click();
  await expect(page.locator(".report-row")).toHaveCount(3);
  await page.getByRole("searchbox", { name: "신고 검색" }).fill("링크왕");
  await expect(page.locator(".report-row")).toHaveCount(1);
  await expect(page.locator(".report-table__footer")).toContainText("1건 표시 중");
  await page.getByRole("searchbox", { name: "신고 검색" }).fill("없는검색어");
  await expect(page.locator(".report-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이전 페이지" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "다음 페이지" })).toBeDisabled();
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "신고 목록을 새로고침했어요." }),
  ).toBeVisible();
});

for (const kind of ["login", "logout"] as const) {
  test(`${kind} 대기 중 중복 제출을 막고 실패 후 재시도를 허용한다`, async ({ page }) => {
    await page.goto("/");
    const control = await page.evaluateHandle(async (mode) => {
      const modulePath = "/tests/browser-harness.tsx";
      const harness: typeof BrowserHarness = await import(modulePath);
      return harness.mountDeferredForm(mode);
    }, kind);
    const submit =
      kind === "login"
        ? page.getByRole("button", { name: /^로그인/ })
        : page.getByRole("dialog").getByRole("button", { name: /^로그아웃/ });
    if (kind === "login") {
      await page.getByRole("form").evaluate((form) => {
        (form as HTMLFormElement).requestSubmit();
        (form as HTMLFormElement).requestSubmit();
      });
    } else {
      await submit.evaluate((button) => {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
      });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeVisible();
    }
    expect(await control.evaluate((value) => value.requests)).toBe(1);
    await expect(submit).toBeDisabled();
    await control.evaluate((value) => value.fail());
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(submit).toBeEnabled();
    await submit.click();
    expect(await control.evaluate((value) => value.requests)).toBe(2);
    await control.evaluate((value) => value.succeed());
    if (kind === "logout") await expect(page.getByRole("dialog")).not.toBeVisible();
    await control.dispose();
  });
}

test("로그인 카드와 모달은 작은 화면에서도 가로로 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/designs/login");
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/#/designs/logout-confirm");
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(350);
  expect(bounds!.x).toBeGreaterThanOrEqual(20);
});
