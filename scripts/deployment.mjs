/** @param {string} [value] */
export function normalizeBase(value = "/") {
  const base = value || "/";
  if (
    !base.startsWith("/") ||
    base.startsWith("//") ||
    !/^\/[A-Za-z0-9_./-]*$/.test(base) ||
    base.split("/").some((segment) => segment === "." || segment === "..") ||
    base.slice(1).includes("//")
  )
    throw new Error(
      "VITE_BASE_PATH must be an absolute application path such as /reflection-compass/",
    );
  return base.endsWith("/") ? base : base + "/";
}
/** @param {string} [value] */
export function normalizeApiOrigin(value = "") {
  if (!value) return "";
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "VITE_API_BASE_URL must be an HTTPS origin (localhost HTTP is allowed for development)",
    );
  return url.origin;
}
