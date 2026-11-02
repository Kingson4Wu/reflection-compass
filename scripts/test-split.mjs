import { spawnSync } from "node:child_process";
const env = {
  ...process.env,
  VITE_BASE_PATH: "/reflection-compass/",
  VITE_API_BASE_URL: "http://127.0.0.1:8788",
  BROWSER_API_ORIGIN: "http://127.0.0.1:8788",
};
for (const args of [
  ["run", "build"],
  [
    "exec",
    "playwright",
    "test",
    "--",
    "--config",
    "playwright.split.config.ts",
    ...process.argv.slice(2),
  ],
]) {
  const result = spawnSync("npm", args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
