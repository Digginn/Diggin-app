import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: "22400000-0000-0000-0000-000000000001",
  email: "admin@test.invalid",
  app_metadata: { provider: "email" },
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
};
const session = {
  access_token: "admin-access-token",
  refresh_token: "test-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
};
const counts = { all: 25, received: 24, reviewing: 1, resolved: 0, rejected: 0 };
const group = {
  id: "9223372036854775807",
  content_id: "42",
  type: "post",
  author_id: "22400000-0000-0000-0000-000000000002",
  author: "느긋한디기12",
  content: "실제 API 응답 본문",
  report_count: 2,
  first_at: "2026-11-20T01:00:00Z",
  latest_at: "2026-11-21T02:00:00Z",
  status: "reviewing",
  reasons: { abuse: 2, spam: 0, inappropriate: 0, other: 0 },
};
function detail(status = "reviewing") {
  const content = {
    id: "42",
    content: "실제 API 응답 본문",
    created_at: group.first_at,
    deleted_at: null,
    hidden_at: null,
  };
  return {
    report: {
      id: group.id,
      target_type: "post",
      post_id: "42",
      reported_user_id: group.author_id,
      reason: "abuse",
      status,
      created_at: group.first_at,
    },
    related_reports: [
      {
        id: group.id,
        reason: "abuse",
        status,
        created_at: group.first_at,
        reporter_id: "reporter",
      },
    ],
    post: content,
    comment: null,
    author_name: group.author,
    author: { id: group.author_id, status: "active", restricted_until: null },
    group_status: status,
    report_count: 1,
    products: [],
    sanctions: [],
    actions: [],
  };
}
type Body = Record<string, unknown>;
async function reply(route: Route, value: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
async function setup(page: Page, handler?: (body: Body, route: Route) => Promise<boolean>) {
  await page.route("https://admin-test.invalid/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await reply(route, {});
      return;
    }
    if (route.request().url().includes("/auth/v1/token")) {
      await reply(route, session);
      return;
    }
    if (route.request().url().includes("/auth/v1/logout")) {
      await reply(route, {});
      return;
    }
    const body = route.request().postDataJSON() as Body;
    expect(route.request().headers().authorization).toBe(`Bearer ${session.access_token}`);
    expect(route.request().headers().apikey).toBe("sb_publishable_admin_test");
    expect(body).not.toHaveProperty("actor");
    if (handler && (await handler(body, route))) return;
    if (body.resource === "session")
      await reply(route, { id: user.id, email: user.email, role: "operator" });
    else if (body.resource === "reports") await reply(route, { counts, rows: [group], total: 25 });
    else if (body.resource === "report_detail") await reply(route, detail());
    else await reply(route, { rows: [], total: 0 });
  });
}
async function signedIn(page: Page) {
  await page.addInitScript(
    (value) => localStorage.setItem("diggin-admin-auth-admin-test.invalid", JSON.stringify(value)),
    session,
  );
}

test("실제 로그인 요청, 권한 확인, 새로고침 세션 복원과 로그아웃", async ({ page }) => {
  await setup(page);
  await page.goto("/#/login");
  await page.getByLabel("이메일", { exact: true }).fill(user.email);
  await page.getByLabel("비밀번호", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByText(group.content)).toBeVisible();
  await page.reload();
  await expect(page.getByText(group.content)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath("live-reports.png"), fullPage: true });
  await page.getByRole("button", { name: `운영자 ${user.email} 프로필 메뉴` }).click();
  await page.getByRole("menuitem", { name: "로그아웃" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("diggin-admin-auth-admin-test.invalid")),
  ).toBeNull();
});

test("일반 계정은 권한 오류를 표시하고 관리자 데이터를 표시하지 않는다", async ({ page }) => {
  await signedIn(page);
  await setup(page, async (body, route) => {
    if (body.resource !== "session") throw new Error("권한 확인 전 데이터 요청");
    await reply(route, { error: "admin_required" }, 403);
    return true;
  });
  await page.goto("/#/reports");
  await expect(page.getByRole("alert")).toContainText("관리자 권한이 없습니다");
  await expect(page.locator(".report-row")).toHaveCount(0);
});

test("관리자 확인 API가 미배포된 경우 입력 오류 대신 배포 대기 안내를 표시한다", async ({
  page,
}) => {
  await signedIn(page);
  let isDeployed = false;
  await setup(page, async (body, route) => {
    if (body.resource !== "session" || isDeployed) return false;
    await reply(route, { error: "invalid_request" }, 400);
    return true;
  });
  await page.goto("/#/reports");
  await expect(page.getByRole("alert")).toContainText(
    "관리자 서비스 배포가 아직 완료되지 않았습니다",
  );
  await expect(page.getByRole("alert")).not.toContainText("입력값");
  await expect(page.locator(".report-row")).toHaveCount(0);
  isDeployed = true;
  await page.getByRole("button", { name: "다시 확인" }).click();
  await expect(page.getByText(group.content)).toBeVisible();
});

test("목록의 실제 잘못된 요청은 배포 오류로 바꾸지 않는다", async ({ page }) => {
  await signedIn(page);
  await setup(page, async (body, route) => {
    if (body.resource !== "reports") return false;
    await reply(route, { error: "invalid_request" }, 400);
    return true;
  });
  await page.goto("/#/reports");
  await expect(page.getByRole("alert")).toContainText("입력값이나 현재 상태를 확인해 주세요.");
  await expect(page.getByRole("alert")).not.toContainText("배포");
});

test("목록 검색·유형·페이지를 서버로 전달하고 조회 실패 뒤 재시도한다", async ({ page }) => {
  await signedIn(page);
  const requests: Body[] = [];
  let fail = false;
  await setup(page, async (body, route) => {
    if (body.resource !== "reports") return false;
    requests.push(body);
    if (fail) {
      await reply(route, { error: "request_failed" }, 500);
      return true;
    }
    await reply(route, {
      counts,
      rows: body.page === 2 || body.query ? [] : [group],
      total: body.query ? 0 : 25,
    });
    return true;
  });
  await page.goto("/#/reports");
  await expect(page.getByText(group.content)).toBeVisible();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect.poll(() => requests.at(-1)?.page).toBe(2);
  await page.getByRole("searchbox", { name: "신고 검색" }).fill("없는내용");
  await expect.poll(() => requests.at(-1)?.query).toBe("없는내용");
  expect(requests.at(-1)?.page).toBe(1);
  await expect(page.getByText("조건에 맞는 신고가 없습니다.")).toBeVisible();
  fail = true;
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("상세의 제재 성공·상태 변경 응답 유실은 같은 ID로 재시도하고 제재를 반복하지 않는다", async ({
  page,
}) => {
  await signedIn(page);
  const mutations: Body[] = [];
  let status = "reviewing";
  let statusCalls = 0;
  await setup(page, async (body, route) => {
    if (body.resource === "report_detail") {
      await reply(route, detail(status));
      return true;
    }
    if (body.action === "sanction" || body.action === "report_group_status") {
      mutations.push(body);
      if (body.action === "report_group_status") {
        statusCalls++;
        status = "resolved";
        if (statusCalls === 1) {
          await route.abort("failed");
          return true;
        }
      }
      await reply(route, { state: "applied", action_id: "1" });
      return true;
    }
    return false;
  });
  await page.goto(`/#/reports/${group.id}`);
  await page
    .getByRole("group", { name: "신고 상태 변경" })
    .getByRole("button", { name: "처리 완료" })
    .click();
  await page
    .getByRole("group", { name: "작성자 제재 선택" })
    .getByRole("button", { name: "경고", exact: false })
    .click();
  await page.getByRole("textbox", { name: "조치 사유" }).fill("정책 위반 확인");
  await page.getByRole("button", { name: "조치 적용", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("alert").first()).toContainText("일부 조치는 적용되었습니다");
  await page.getByRole("button", { name: "같은 요청 재시도" }).click();
  await expect(page.getByRole("status").filter({ hasText: "조치가 적용되었습니다" })).toBeVisible();
  expect(mutations.filter((body) => body.action === "sanction")).toHaveLength(1);
  const changes = mutations.filter((body) => body.action === "report_group_status");
  expect(changes).toHaveLength(2);
  expect(changes[0].request_id).toBe(changes[1].request_id);
  expect(changes[0].report_id).toBe(group.id);
});

test("접수에서 바로 완료를 막고 숨김은 입력한 사유와 UUID 요청 ID를 전송한다", async ({ page }) => {
  await signedIn(page);
  const mutations: Body[] = [];
  await setup(page, async (body, route) => {
    if (body.resource === "report_detail") {
      await reply(route, detail("received"));
      return true;
    }
    if (body.action === "hide") {
      mutations.push(body);
      await reply(route, { action_id: "1" });
      return true;
    }
    return false;
  });
  await page.goto(`/#/reports/${group.id}`);
  await expect(page.getByRole("button", { name: "처리 완료", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "숨기기" })).toBeDisabled();
  await page.getByRole("textbox", { name: "조치 사유" }).fill("원문 확인 후 숨김");
  await page.getByRole("button", { name: "숨기기" }).click();
  await expect.poll(() => mutations.length).toBe(1);
  expect(mutations[0]).toMatchObject({
    report_id: group.id,
    reason: "원문 확인 후 숨김",
    reason_category: "other",
  });
  expect(mutations[0].request_id).toMatch(/^[0-9a-f-]{36}$/);
});

test("회원과 제재 목록은 실제 응답을 사용하고 빈 결과를 안내한다", async ({ page }) => {
  await signedIn(page);
  await setup(page);
  await page.goto("/#/members");
  await expect(page.getByRole("heading", { name: "회원 관리", exact: true })).toBeVisible();
  await expect(page.getByText("조건에 맞는 내역이 없습니다.")).toBeVisible();
  await page.getByRole("link", { name: "제재 이력" }).click();
  await expect(page.getByRole("heading", { name: "제재 이력", exact: true })).toBeVisible();
});

test("만료된 access token은 refresh token으로 갱신하고 권한 회수 시 화면을 닫는다", async ({
  page,
}) => {
  await page.addInitScript(
    (value) => localStorage.setItem("diggin-admin-auth-admin-test.invalid", JSON.stringify(value)),
    { ...session, expires_at: Math.floor(Date.now() / 1000) - 3600 },
  );
  const refreshes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("grant_type=refresh_token"))
      refreshes.push(request.postData() ?? "");
  });
  await setup(page, async (body, route) => {
    if (body.resource !== "members") return false;
    await reply(route, { error: "admin_required" }, 403);
    return true;
  });
  await page.goto("/#/reports");
  await expect(page.getByText(group.content)).toBeVisible();
  expect(refreshes.length).toBeGreaterThan(0);
  await page.getByRole("link", { name: "회원 관리" }).click();
  await expect(page.getByRole("alert")).toContainText("관리자 권한이 없습니다");
  await expect(page.getByText(group.content)).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("제재 이력에서 보관 유지를 확인 후 설정·해제하고 실패하면 상태를 유지한다", async ({
  page,
}) => {
  await signedIn(page);
  const holds: Body[] = [];
  let isHeld = false;
  let shouldFail = false;
  await setup(page, async (body, route) => {
    if (body.resource === "sanctions") {
      await reply(route, {
        total: 1,
        rows: [
          {
            id: "71",
            user_id: group.author_id,
            target_id: group.author_id,
            nickname: group.author,
            kind: "suspended",
            reason_category: "abuse",
            reason: "정책 위반",
            restricted_until: null,
            created_at: group.latest_at,
            state: "active",
            released_at: null,
            is_held: isHeld,
            handled_by: "diggin.app@gmail.com",
          },
        ],
      });
      return true;
    }
    if (body.action !== "retention_hold") return false;
    holds.push(body);
    if (shouldFail) await reply(route, { error: "request_failed" }, 503);
    else {
      isHeld = body.held === true;
      await reply(route, { held: isHeld });
    }
    return true;
  });
  await page.goto("/#/sanctions");
  const table = page.getByRole("table");
  await expect(table.getByRole("cell", { name: "운영자 diggin.app" })).toBeVisible();
  await expect(page.getByRole("button", { name: "해제", exact: true })).toHaveCount(0);

  await table.getByRole("button", { name: "보관 유지하기" }).click();
  await page.getByRole("button", { name: "취소할게요" }).click();
  expect(holds).toHaveLength(0);
  await table.getByRole("button", { name: "보관 유지하기" }).click();
  await page.getByRole("button", { name: "보관을 유지할게요" }).click();
  await expect(page.locator(".admin-toast")).toHaveText("보관 유지를 설정했습니다.");
  await expect(table.getByText("보관 유지", { exact: true })).toBeVisible();
  expect(holds[0]).toMatchObject({ target_type: "sanction", target_id: "71", held: true });

  await table.getByRole("button", { name: "유지 해제하기" }).click();
  await page.getByRole("button", { name: "해제할게요" }).click();
  await expect(page.locator(".admin-toast")).toHaveText("보관 유지를 해제했습니다.");
  await expect(table.getByText("삭제 예정")).toBeVisible();

  shouldFail = true;
  await table.getByRole("button", { name: "보관 유지하기" }).click();
  await page.getByRole("button", { name: "보관을 유지할게요" }).click();
  await expect(page.locator(".admin-toast")).toHaveText("보관 유지를 처리하지 못했습니다.");
  await expect(table.getByRole("button", { name: "보관 유지하기" })).toBeEnabled();
});

test("수정된 댓글과 개별 신고 당시의 원문을 함께 확인한다", async ({ page }) => {
  await signedIn(page);
  await setup(page, async (body, route) => {
    if (body.resource !== "report_detail") return false;
    const value = detail();
    await reply(route, {
      ...value,
      report: { ...value.report, target_type: "comment", reported_content: "최신 신고 당시 원문" },
      comment: { ...value.post, id: "99", content: "신고 후 수정된 댓글" },
      related_reports: [
        { ...value.related_reports[0], reported_content: "최신 신고 당시 원문" },
        { ...value.related_reports[0], id: "41", reported_content: "이전 신고 당시 원문" },
      ],
      report_count: 2,
    });
    return true;
  });
  await page.goto(`/#/reports/${group.id}`);
  await expect(page.getByText("신고 후 수정된 댓글", { exact: true })).toBeVisible();
  await expect(page.getByText("최신 신고 당시 원문", { exact: true })).toBeVisible();
  await expect(page.getByText("이전 신고 당시 원문", { exact: true })).toBeVisible();
});

for (const leave of ["목록 이동", "새로고침", "같은 콘텐츠의 다른 신고로 이동"] as const) {
  test(`경고 응답 유실 뒤 ${leave}해도 같은 요청으로 복구한다`, async ({ page }) => {
    await signedIn(page);
    const mutations: Body[] = [];
    await setup(page, async (body, route) => {
      if (body.action !== "sanction") return false;
      mutations.push(body);
      if (mutations.length === 1) await route.abort("failed");
      else await reply(route, { state: "applied", action_id: "1" });
      return true;
    });
    await page.goto(`/#/reports/${group.id}`);
    await page
      .getByRole("group", { name: "작성자 제재 선택" })
      .getByRole("button", { name: "경고", exact: false })
      .click();
    await page.getByRole("textbox", { name: "조치 사유" }).fill("정책 위반 확인");
    await page.getByRole("button", { name: "조치 적용", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "적용하기" }).click();
    await expect(page.getByRole("button", { name: "같은 요청 재시도" })).toBeVisible();
    if (leave === "목록 이동") {
      await page.getByRole("link", { name: "← 신고 목록" }).click();
      await expect(page).toHaveURL(/#\/reports$/);
      await page.goto(`/#/reports/${group.id}`);
    } else if (leave === "새로고침") await page.reload();
    else await page.goto("/#/reports/41");
    await page.getByRole("button", { name: "같은 요청 재시도" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "조치가 적용되었습니다" }),
    ).toBeVisible();
    expect(mutations).toHaveLength(2);
    expect(mutations[1]).toEqual(mutations[0]);
  });
}

test("부분 성공 뒤 새로고침해도 완료된 경고를 반복하지 않는다", async ({ page }) => {
  await signedIn(page);
  const mutations: Body[] = [];
  let status = "reviewing";
  await setup(page, async (body, route) => {
    if (body.resource === "report_detail") {
      await reply(route, detail(status));
      return true;
    }
    if (body.action !== "sanction" && body.action !== "report_group_status") return false;
    mutations.push(body);
    if (body.action === "report_group_status" && status === "reviewing") {
      status = "resolved";
      await route.abort("failed");
    } else await reply(route, { state: "applied", action_id: "1" });
    return true;
  });
  await page.goto(`/#/reports/${group.id}`);
  await page
    .getByRole("group", { name: "신고 상태 변경" })
    .getByRole("button", { name: "처리 완료" })
    .click();
  await page
    .getByRole("group", { name: "작성자 제재 선택" })
    .getByRole("button", { name: "경고", exact: false })
    .click();
  await page.getByRole("textbox", { name: "조치 사유" }).fill("정책 위반 확인");
  await page.getByRole("button", { name: "조치 적용", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("button", { name: "같은 요청 재시도" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "같은 요청 재시도" }).click();
  await expect(page.getByRole("status").filter({ hasText: "조치가 적용되었습니다" })).toBeVisible();
  expect(mutations.filter((body) => body.action === "sanction")).toHaveLength(1);
  const changes = mutations.filter((body) => body.action === "report_group_status");
  expect(changes).toHaveLength(2);
  expect(changes[1]).toEqual(changes[0]);
});

test("재시도 정보를 저장할 수 없으면 조치를 전송하지 않는다", async ({ page }) => {
  await signedIn(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("diggin-admin-pending:")) throw new Error("storage unavailable");
      original.call(this, key, value);
    };
  });
  const mutations: Body[] = [];
  await setup(page, async (body, route) => {
    if (body.action !== "sanction") return false;
    mutations.push(body);
    await reply(route, { state: "applied" });
    return true;
  });
  await page.goto(`/#/reports/${group.id}`);
  await page
    .getByRole("group", { name: "작성자 제재 선택" })
    .getByRole("button", { name: "경고", exact: false })
    .click();
  await page.getByRole("textbox", { name: "조치 사유" }).fill("정책 위반 확인");
  await page.getByRole("button", { name: "조치 적용", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("alert")).toContainText("재시도 정보를 보관할 수 없습니다");
  expect(mutations).toHaveLength(0);
});

test("서버가 실패로 확정한 제재만 새 요청 ID로 복구한다", async ({ page }) => {
  await signedIn(page);
  const mutations: Body[] = [];
  await setup(page, async (body, route) => {
    if (body.action !== "sanction") return false;
    mutations.push(body);
    if (mutations.length === 1) await reply(route, { error: "request_failed_use_new_id" }, 400);
    else await reply(route, { state: "applied" });
    return true;
  });
  await page.goto(`/#/reports/${group.id}`);
  await page
    .getByRole("group", { name: "작성자 제재 선택" })
    .getByRole("button", { name: "경고", exact: false })
    .click();
  await page.getByRole("textbox", { name: "조치 사유" }).fill("정책 위반 확인");
  await page.getByRole("button", { name: "조치 적용", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "적용하기" }).click();
  await page.getByRole("button", { name: "같은 요청 재시도" }).click();
  await expect(page.getByRole("status").filter({ hasText: "조치가 적용되었습니다" })).toBeVisible();
  expect(mutations).toHaveLength(2);
  expect(mutations[0].request_id).not.toBe(mutations[1].request_id);
});
