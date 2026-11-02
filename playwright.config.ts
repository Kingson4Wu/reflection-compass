import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: process.env.BROWSER_APP_URL || "http://127.0.0.1:8787",
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
  },
  workers: 1,
});
