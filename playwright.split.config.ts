import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173/reflection-compass/",
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
  },
  webServer: [
    {
      command:
        "npx wrangler d1 execute compass --local --persist-to .wrangler/split-test-state --file worker/schema.sql && npm run dev:api -- --port 8788 --persist-to .wrangler/split-test-state --var ALLOWED_ORIGINS:http://127.0.0.1:4173",
      url: "http://127.0.0.1:8788/api/health",
      timeout: 60000,
      reuseExistingServer: false,
    },
    {
      command: "npm run preview:frontend",
      url: "http://127.0.0.1:4173/reflection-compass/",
      timeout: 30000,
      reuseExistingServer: false,
    },
  ],
});
