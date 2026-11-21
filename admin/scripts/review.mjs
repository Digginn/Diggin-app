import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const adminRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.dirname(adminRoot);
const suffix = createHash("sha256").update(repoRoot).digest("hex").slice(0, 8);
const projectId = `diggin-admin-review-${suffix}`;
const workdir = path.join(os.tmpdir(), projectId);
const apiUrl = "http://127.0.0.1:55421";
const password = "LocalReview!224"; // localhost의 가상 검증 계정 전용이다.
const children = [];
let hasStartedDb = false;
let isStopping = false;

function cli(args, input) {
  const result = spawnSync("supabase", [...args, "--workdir", workdir], {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(
      `Supabase ${args[0]} 실패: ${(result.stderr || result.error?.message || "").slice(-1500)}`,
    );
  return result.stdout;
}

async function waitFor(url, options, expected = 200) {
  for (let count = 0; count < 120; count++) {
    try {
      if ((await fetch(url, options)).status === expected) return;
    } catch {
      /* 시작 중 */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`검증 서버가 응답하지 않습니다: ${url}`);
}

function stop(code = 0) {
  if (isStopping) return;
  isStopping = true;
  for (const child of children) child.kill();
  try {
    if (hasStartedDb) cli(["stop", "--project-id", projectId, "--no-backup"]);
  } catch {
    /* 시작 실패 시에도 자식 프로세스를 종료한다. */
  }
  process.exit(code);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

async function start() {
  for (const port of [5174, 55425]) {
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", () =>
        reject(
          new Error(`${port} 포트를 사용 중입니다. 기존 검증 서버를 종료한 후 실행해 주세요.`),
        ),
      );
      server.listen(port, "127.0.0.1", () => server.close(resolve));
    });
  }
  console.log("로컬 검증 환경을 준비합니다. 이 환경의 예시 데이터는 매 실행 시 초기화됩니다.");
  const project = path.join(workdir, "supabase");
  fs.mkdirSync(project, { recursive: true });
  fs.cpSync(path.join(repoRoot, "supabase/migrations"), path.join(project, "migrations"), {
    recursive: true,
  });
  let config = fs
    .readFileSync(path.join(repoRoot, "supabase/config.toml"), "utf8")
    .replace('project_id = "Diggin-app"', `project_id = "${projectId}"`)
    .replaceAll("5432", "5542");
  for (const provider of ["google", "kakao", "apple"]) {
    config = config.replace(
      new RegExp(`(\\[auth\\.external\\.${provider}\\][\\s\\S]*?)(?=\\n\\[|$)`),
      (section) =>
        section.replace("enabled = true", "enabled = false").replace(/env\([^)]*\)/g, ""),
    );
  }
  config = config.replace(/(\[db\.seed\][\s\S]*?)enabled = true/, "$1enabled = false");
  if (
    !config.includes(`project_id = "${projectId}"`) ||
    !projectId.startsWith("diggin-admin-review-")
  )
    throw new Error("review_project_required");
  fs.writeFileSync(path.join(project, "config.toml"), config);
  console.log("독립된 로컬 Supabase를 시작합니다…");
  hasStartedDb = true;
  cli(["start", "--exclude", "studio,imgproxy,realtime,edge-runtime,logflare,vector,supavisor"]);
  cli(["db", "reset", "--local", "--no-seed"]);
  const status = JSON.parse(cli(["status", "--output", "json"]));
  if (status.API_URL !== apiUrl) throw new Error("local_review_database_required");
  const auth = { persistSession: false, autoRefreshToken: false };
  const service = createClient(apiUrl, status.SERVICE_ROLE_KEY, { auth });
  const ids = [];
  for (const email of [
    "admin@diggin.local",
    "author@diggin.local",
    "second@diggin.local",
    "reporter@diggin.local",
  ]) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`리뷰 계정 생성 실패: ${error?.code ?? "unknown"}`);
    ids.push(data.user.id);
  }
  const seed = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      `supabase_db_${projectId}`,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `admin_id=${ids[0]}`,
      "-v",
      `author_id=${ids[1]}`,
      "-v",
      `second_id=${ids[2]}`,
      "-v",
      `reporter_id=${ids[3]}`,
    ],
    {
      encoding: "utf8",
      input: fs.readFileSync(path.join(adminRoot, "scripts/review-seed.sql"), "utf8"),
      windowsHide: true,
    },
  );
  if (seed.status !== 0) throw new Error(`예시 데이터 생성 실패: ${seed.stderr}`);
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("npm run review 명령으로 실행해 주세요.");
  const deno = spawnSync(
    process.execPath,
    [
      npm,
      "exec",
      "--yes",
      "--package=deno@2.5.6",
      "--",
      "deno",
      "eval",
      "console.log(Deno.execPath())",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      windowsHide: true,
    },
  );
  const denoPath = deno.stdout?.trim();
  if (deno.status !== 0 || !denoPath || !fs.existsSync(denoPath))
    throw new Error("검증 API 실행에 필요한 Deno를 준비하지 못했습니다.");
  const api = spawn(
    denoPath,
    [
      "run",
      "--allow-env",
      "--allow-net",
      "--config",
      path.join(repoRoot, "supabase/functions/deno.json"),
      path.join(adminRoot, "scripts/review-api.ts"),
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        SUPABASE_URL: apiUrl,
        SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      },
    },
  );
  children.push(api);
  api.once("error", () => stop(1));
  api.once("exit", (code) => stop(code ?? 1));
  await waitFor("http://127.0.0.1:55425", { method: "OPTIONS" }, 204);
  const vite = spawn(
    process.execPath,
    [
      path.join(adminRoot, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5174",
      "--strictPort",
    ],
    {
      cwd: adminRoot,
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        VITE_SUPABASE_URL: apiUrl,
        VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
        VITE_ADMIN_ENVIRONMENT: "review",
      },
    },
  );
  children.push(vite);
  vite.once("error", () => stop(1));
  vite.once("exit", (code) => stop(code ?? 1));
  await waitFor("http://127.0.0.1:5174/");
  console.log(
    `\n관리자 로컬 검증: http://127.0.0.1:5174/#/login\n이메일: admin@diggin.local\n비밀번호: ${password}\n로그인·신고 처리·제재/해제가 실제 로컬 Auth/API/DB로 동작합니다.\n종료: Ctrl+C\n`,
  );
}

start().catch((error) => {
  console.error(error.message);
  stop(1);
});
