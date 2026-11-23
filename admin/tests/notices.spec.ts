import { expect, test, type Page } from "@playwright/test";

import type { Notice } from "../src/api/notices";

const USER = {
  id: "22900000-0000-0000-0000-000000000001",
  email: "admin229@test.invalid",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
};
const SESSION = {
  user: USER,
  access_token: "notice-test-access",
  refresh_token: "notice-test-refresh",
  token_type: "bearer",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
};
const INITIAL: Notice[] = [
  {
    id: "5",
    title: "개인정보 처리방침 개정 안내",
    body: "개인정보 처리방침 개정 내용을 알려 드립니다.",
    inbox_body: "",
    inbox_only: false,
    comments_closed: false,
    revision: 1,
    is_visible: true,
    created_at: "2026-11-21T09:30:00Z",
  },
  {
    id: "4",
    title: "커뮤니티 이용정책 개정 안내",
    body: "이용정책이 개정됩니다.",
    inbox_body: "",
    inbox_only: false,
    comments_closed: true,
    revision: 1,
    is_visible: true,
    created_at: "2026-11-14T01:05:00Z",
  },
  {
    id: "3",
    title: "댓글 기능 업데이트 안내",
    body: "댓글이 150자로 변경됩니다.",
    inbox_body: "",
    inbox_only: false,
    comments_closed: false,
    revision: 1,
    is_visible: true,
    created_at: "2026-11-07T08:20:00Z",
  },
  {
    id: "2",
    title: "서비스 점검 안내 (11.05 02:00~04:00)",
    body: "서버 점검 안내입니다.",
    inbox_body: "",
    inbox_only: true,
    comments_closed: true,
    revision: 1,
    is_visible: false,
    created_at: "2026-11-03T12:10:00Z",
  },
  {
    id: "1",
    title: "Diggin 베타 테스터 참여 감사 안내",
    body: "참여해 주셔서 감사합니다.",
    inbox_body: "",
    inbox_only: false,
    comments_closed: false,
    revision: 1,
    is_visible: true,
    created_at: "2026-10-28T00:40:00Z",
  },
];
async function setup(page: Page, { loseCreateResponse = false } = {}) {
  const rows = structuredClone(INITIAL);
  const calls: Record<string, unknown>[] = [];
  const results = new Map<string, Notice>();
  let hasLostResponse = false;
  await page.addInitScript(
    (value) => localStorage.setItem("diggin-admin-auth-admin-test.invalid", JSON.stringify(value)),
    SESSION,
  );
  await page.route("https://admin-test.invalid/**", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const reply = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    if (body.resource === "session")
      return reply({ id: USER.id, email: USER.email, role: "operator" });
    expect(body.action).toBe("notice");
    expect(body).not.toHaveProperty("actor");
    expect(route.request().headers().authorization).toBe(`Bearer ${SESSION.access_token}`);
    const payload = body.payload as Record<string, unknown>;
    if (body.operation === "list") return reply({ total: rows.length, rows });
    if (body.operation === "get") return reply(rows.find((row) => row.id === body.notice_id));
    calls.push(body);
    const key = String(body.request_id);
    expect(key).toMatch(/^[a-f0-9-]{36}$/);
    if (results.has(key)) return reply(results.get(key));
    let row = rows.find((entry) => entry.id === body.notice_id);
    if (body.operation === "create") {
      row = {
        ...payload,
        id: "6",
        revision: 1,
        is_visible: true,
        created_at: new Date().toISOString(),
      } as Notice;
      rows.unshift(row);
    } else {
      expect(payload.revision).toBe(row!.revision);
      if (body.operation === "update") Object.assign(row!, payload);
      if (body.operation === "visibility") row!.is_visible = payload.is_visible === true;
      if (body.operation === "delete") rows.splice(rows.indexOf(row!), 1);
      row!.revision++;
    }
    results.set(key, structuredClone(row!));
    if (loseCreateResponse && body.operation === "create" && !hasLostResponse) {
      hasLostResponse = true;
      return reply({ error: "request_failed" }, 500);
    }
    return reply(row);
  });
  return { rows, calls };
}

test("공지 목록·숨김·공개·삭제 확인은 실제 요청과 최신 버전을 사용한다", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/#/notices");
  const table = page.getByRole("table", { name: "공지 목록" });
  await expect(table.locator("tbody tr")).toHaveCount(5);
  await expect(table.getByRole("columnheader")).toHaveText(["제목", "공개 상태", "등록일", "관리"]);
  await page.screenshot({ path: test.info().outputPath("notice-list.png"), fullPage: true });
  await table
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "숨기기", exact: true })
    .click();
  await expect(table.locator("tbody tr").first()).toContainText("공개하기");
  await table.locator("tbody tr").first().getByRole("button", { name: "공개하기" }).click();
  await expect(table.locator("tbody tr").first()).toContainText("숨기기");
  await page.getByRole("button", { name: "개인정보 처리방침 개정 안내 삭제" }).click();
  await expect(page.getByRole("dialog")).toContainText("복구할 수 없습니다");
  await page.keyboard.press("Escape");
  expect(state.rows).toHaveLength(5);
  await page.getByRole("button", { name: "개인정보 처리방침 개정 안내 삭제" }).click();
  await page.getByRole("button", { name: "삭제할게요" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(4);
  expect(state.calls.map((call) => call.operation)).toEqual(["visibility", "visibility", "delete"]);
});

test("공지 입력은 미리보기에 반영되고 기기·알림함·댓글 닫기가 전환된다", async ({ page }) => {
  await setup(page);
  await page.goto("/#/notices/new");
  const save = page.getByRole("button", { name: "등록", exact: true });
  await expect(save).toBeDisabled();
  await page
    .getByLabel("제목", { exact: false })
    .first()
    .fill("필요한 기능을 댓글로 알려 주세요. 💌");
  await page
    .getByLabel("게시글 본문")
    .fill(
      "안녕하세요, Diggin 팀입니다.\n\n필요한 기능을 댓글 또는 MY 탭의 문의 채널을 통해 알려주세요.\n\n감사합니다. :)",
    );
  const preview = page.getByRole("complementary", { name: "앱 미리보기" });
  await expect(preview.getByRole("heading", { level: 3 })).toContainText("필요한 기능");
  await expect(save).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath("notice-editor.png"), fullPage: true });
  await page.getByLabel("댓글 닫기", { exact: true }).check();
  await expect(preview.locator(".notice-preview-input")).toHaveCount(0);
  await expect(preview.getByText("좋은 소식이네요. 기대할게요!")).toHaveCount(0);
  await page
    .getByLabel("알림함 본문", { exact: false })
    .fill("작은 팀이 만드는 디긴에 필요한 기능을 알려 주세요.");
  await preview.getByRole("tab", { name: "알림함", exact: true }).click();
  await expect(preview.locator(".notice-preview-notification")).toContainText("작은 팀");
  await preview.getByRole("tab", { name: "대형 iPhone 17 Pro Max" }).click();
  await expect(preview.locator(".notice-phone")).toHaveCSS("width", "440px");
  await page.getByLabel("제목", { exact: false }).first().fill("가".repeat(101));
  await expect(save).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("100자");
});

test("등록 응답 유실 후 새로고침해도 같은 요청을 복구해 중복 등록하지 않는다", async ({ page }) => {
  const state = await setup(page, { loseCreateResponse: true });
  await page.goto("/#/notices/new");
  await page.getByLabel("제목", { exact: false }).first().fill("복구할 공지");
  await page.getByLabel("게시글 본문").fill("응답 유실을 확인할 본문입니다.");
  await page.getByRole("button", { name: "등록", exact: true }).click();
  await expect(page.getByRole("button", { name: "처리 결과 확인" })).toBeEnabled();
  expect(state.rows).toHaveLength(6);
  await page.reload();
  await expect(page.getByLabel("게시글 본문")).toHaveValue("응답 유실을 확인할 본문입니다.");
  await page.getByRole("button", { name: "처리 결과 확인" }).click();
  await expect(page).toHaveURL(/#\/notices$/);
  await expect(page.getByRole("table")).toContainText("복구할 공지");
  expect(state.rows).toHaveLength(6);
  expect(state.calls).toHaveLength(2);
  expect(state.calls[0].request_id).toBe(state.calls[1].request_id);
});

test("기존 공지 수정은 입력값과 revision을 보내고 성공 목록으로 돌아간다", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/#/notices/5/edit");
  await expect(page.getByLabel("제목", { exact: false }).first()).toHaveValue(INITIAL[0].title);
  await page.getByLabel("제목", { exact: false }).first().fill("새 제목");
  await page.getByLabel("알림함에만 전송", { exact: true }).check();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await expect(page).toHaveURL(/#\/notices$/);
  await expect(page.getByRole("table")).toContainText("새 제목");
  expect(state.rows[0].inbox_only).toBe(true);
  expect(state.rows[0].revision).toBe(2);
});
