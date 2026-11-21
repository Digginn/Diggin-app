import process from "node:process";

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "review-local.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    channel: process.platform === "win32" ? "msedge" : undefined,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
});
