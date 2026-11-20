import { expect, test } from "@playwright/test";

const STATES = [
  {
    content: "post-30",
    title: "게시글 #30",
    reports: 3,
    history: 5,
    outcome: "처리 완료",
    sanction: "커뮤니티 이용 제한",
    reason:
      "동일 게시글에 욕설·비방 신고가 반복 접수되어 커뮤니티 운영정책 3조에 따라 7일 이용 제한합니다.",
  },
  {
    content: "comment-112",
    title: "댓글 #112",
    reports: 4,
    history: 1,
    outcome: "처리 완료",
    sanction: "경고",
    reason: "다른 사용자의 취향을 비하하는 표현으로 경고합니다. 반복 시 이용이 제한됩니다.",
  },
  {
    content: "post-11",
    title: "게시글 #11",
    reports: 2,
    history: 0,
    outcome: "반려",
    sanction: null,
    reason: "상품 후기 공유로 신고 사유에 해당하는 내용이 없어 반려합니다.",
  },
  {
    content: "post-10",
    title: "게시글 #10",
    reports: 3,
    history: 1,
    outcome: "처리 완료",
    sanction: "커뮤니티 이용 제한",
    reason: "외부 오픈채팅 유도 홍보 글을 반복 게시하여 7일 이용 제한합니다.",
  },
];
for (const item of STATES) {
  for (const step of ["detail", "input", "confirm", "complete"]) {
    test(`${item.title} ${step} 디자인을 직접 열 수 있다`, async ({ page }) => {
      await page.goto(`/#/designs/report-${item.content}${step === "detail" ? "" : "-" + step}`);
      await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
      await expect(page.locator(".detail-reports li")).toHaveCount(item.reports);
      const isComplete = step === "complete";
      await expect(page.locator(".history-item")).toHaveCount(
        item.history + (isComplete ? (item.sanction ? 2 : 1) : 0),
      );
      await expect(page.locator(".nav-item__count")).toHaveText(isComplete ? "4" : "5");
      if (item.history === 0 && !isComplete)
        await expect(page.getByText("아직 처리 이력이 없습니다.")).toBeVisible();
      if (isComplete) {
        await expect(page.getByRole("region", { name: "처리 결과" })).toBeVisible();
        await expect(page.getByRole("textbox", { name: "조치 사유" })).toHaveCount(0);
        await expect(page.locator(".detail-header .status-badge")).toHaveText(item.outcome);
      } else {
        await expect(page.getByRole("textbox", { name: "조치 사유" })).toHaveValue(
          step === "detail" ? "" : item.reason,
        );
        if (step === "detail")
          await expect(page.getByRole("button", { name: "조치 적용", exact: true })).toBeDisabled();
        else if (step === "input")
          await expect(page.getByRole("button", { name: "조치 적용", exact: true })).toBeEnabled();
      }
      await expect(page.getByRole("dialog", { name: /적용합니까|반려합니까/ })).toHaveCount(
        step === "confirm" ? 1 : 0,
      );
      if (step === "confirm") await expect(page.getByRole("dialog")).toContainText(item.reason);
    });
  }
  test(`${item.title} 목록에서 입력·확인·완료·목록 반영까지 외부 요청 없이 전환한다`, async ({
    page,
  }) => {
    const writes: string[] = [];
    page.on("request", (r) => {
      if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
    });
    await page.goto("/#/designs/reports");
    await page.getByRole("button", { name: `${item.title} 신고 상세 보기`, exact: true }).click();
    await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
    const apply = page.getByRole("button", { name: "조치 적용", exact: true });
    const reason = page.getByRole("textbox", { name: "조치 사유" });
    await reason.fill("   ");
    await expect(apply).toBeDisabled();
    await page
      .getByRole("group", { name: "신고 상태 변경" })
      .getByRole("button", { name: item.outcome, exact: true })
      .click();
    if (item.sanction)
      await page
        .getByRole("group", { name: "작성자 제재 선택" })
        .getByRole("button", { name: new RegExp("^" + item.sanction) })
        .click();
    await reason.fill(item.reason);
    await apply.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(item.reason);
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(apply).toBeFocused();
    await expect(reason).toHaveValue(item.reason);
    await expect(page.locator(".detail-header .status-badge")).not.toHaveText(item.outcome);
    await apply.click();
    await dialog
      .getByRole("button", { name: item.outcome === "반려" ? "반려하기" : "적용하기", exact: true })
      .evaluate((e) => {
        (e as HTMLButtonElement).click();
        (e as HTMLButtonElement).click();
      });
    await expect(page.getByRole("region", { name: "처리 결과" })).toBeVisible();
    await expect(page.locator(".history-item")).toHaveCount(item.history + (item.sanction ? 2 : 1));
    await expect(page.locator(".detail-header .status-badge")).toHaveText(item.outcome);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: item.outcome === "반려" ? "신고를 반려했어요." : "조치를 적용했어요." }),
    ).toBeVisible();
    await page.getByRole("link", { name: "신고 목록", exact: true }).click();
    await expect(
      page
        .getByRole("button", { name: `${item.title} 신고 상세 보기`, exact: true })
        .locator(".status-badge"),
    ).toHaveText(item.outcome);
    await expect(page.locator(".nav-item__count")).toHaveText("4");
    await page.getByRole("button", { name: `${item.title} 신고 상세 보기`, exact: true }).click();
    await expect(page.locator(".detail-header .status-badge")).toHaveText(item.outcome);
    expect(writes).toEqual([]);
    expect(
      await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
    ).toEqual({ local: 0, session: 0 });
  });
}

test("확인 모달은 Escape·배경 클릭·포커스 제한을 지원하고 사유를 200자로 제한한다", async ({
  page,
}) => {
  await page.goto("/#/designs/report-post-30-input");
  const reason = page.getByRole("textbox", { name: "조치 사유" });
  await reason.fill("가".repeat(210));
  await expect(reason).toHaveValue("가".repeat(200));
  const apply = page.getByRole("button", { name: "조치 적용", exact: true });
  await apply.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "적용하기", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(apply).toBeFocused();
  await apply.click();
  await page.mouse.click(10, 10);
  await expect(dialog).not.toBeVisible();
  await expect(reason).toHaveValue("가".repeat(200));
});

test("완료 후에도 콘텐츠 숨김·복구와 이력·새로고침을 확인할 수 있다", async ({ page }) => {
  await page.goto("/#/designs/report-comment-112-complete");
  await page.getByRole("button", { name: "숨기기", exact: true }).click();
  await expect(page.locator(".detail-visibility-chip")).toHaveText("숨김 처리됨");
  await expect(page.locator(".history-item")).toHaveCount(4);
  await page.getByRole("button", { name: "복구하기", exact: true }).click();
  await expect(page.locator(".detail-visibility-chip")).toHaveText("공개 중");
  await expect(page.locator(".history-item")).toHaveCount(5);
  await page.getByRole("button", { name: "상세 새로고침", exact: true }).click();
  await expect(page.getByRole("region", { name: "처리 결과" })).toBeVisible();
});

test("반려를 선택하면 제재 선택을 해제하고 적용 후에도 작성자 제재를 늘리지 않는다", async ({
  page,
}) => {
  await page.goto("/#/designs/report-post-11-input");
  const statuses = page.getByRole("group", { name: "신고 상태 변경" });
  const sanctions = page.getByRole("group", { name: "작성자 제재 선택" });
  await statuses.getByRole("button", { name: "처리 완료", exact: true }).click();
  await sanctions.getByRole("button", { name: /^커뮤니티 이용 제한/ }).click();
  await expect(sanctions.getByRole("button", { pressed: true })).toHaveCount(1);
  await statuses.getByRole("button", { name: "반려", exact: true }).click();
  await expect(sanctions.getByRole("button", { pressed: true })).toHaveCount(0);
  for (const button of await sanctions.getByRole("button").all())
    await expect(button).toBeDisabled();
  await page.getByRole("button", { name: "조치 적용", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "신고를 반려합니까?" });
  await expect(dialog).toContainText("신고 2건이 반려로 변경됩니다.");
  await expect(dialog).toContainText("적용 안 함");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "조치 적용", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "조치 적용", exact: true }).click();
  await dialog.getByRole("button", { name: "반려하기", exact: true }).click();
  await expect(page.locator(".detail-author > span:last-child")).toHaveText("누적 제재 0회");
  await expect(page.locator(".detail-account-chip")).toHaveText("정상 이용");
  await expect(page.locator(".history-item")).toHaveCount(1);
  await expect(page.locator(".history-item__title > p")).toHaveText("신고 반려");
  await expect(
    page.getByRole("region", { name: "처리 결과" }).locator(".detail-result-summary"),
  ).toContainText("조치 없음");
  await expect(page.locator(".detail-restriction")).toHaveCount(0);
});

test("처리 흐름 목차와 작은 화면의 상세·확인 모달을 확인한다", async ({ page }) => {
  await page.goto("/");
  for (const title of ["게시글 #30", "댓글 #112", "게시글 #11", "게시글 #10"])
    await expect(
      page
        .getByRole("navigation", { name: `${title} 처리 흐름 선택`, exact: true })
        .getByRole("link"),
    ).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/designs/report-comment-112-input");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "조치 적용", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});
