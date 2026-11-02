import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { normalizeBase, normalizeApiOrigin } from "./scripts/deployment.mjs";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  normalizeApiOrigin(env.VITE_API_BASE_URL);
  return {
    base: normalizeBase(env.VITE_BASE_PATH),
    plugins: [react()],
    server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  };
});
