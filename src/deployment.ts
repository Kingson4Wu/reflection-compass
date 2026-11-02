import { normalizeApiOrigin } from "../scripts/deployment.mjs";
export const APP_BASE = import.meta.env.BASE_URL;
export const appPath = (path = "") => APP_BASE + path.replace(/^\/+/, "");
export const apiOrigin = () =>
  normalizeApiOrigin(import.meta.env.VITE_API_BASE_URL);
export const sessionKey = `compass-token:${APP_BASE}`;
