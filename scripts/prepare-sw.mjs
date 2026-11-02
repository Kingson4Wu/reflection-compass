import { readFile, readdir, writeFile } from "node:fs/promises";
import { loadEnv } from "vite";
import { normalizeBase, normalizeApiOrigin } from "./deployment.mjs";
import { createPwa } from "./pwa.mjs";
const env = loadEnv("production", process.cwd(), "VITE_");
const base = normalizeBase(env.VITE_BASE_PATH);
const api = normalizeApiOrigin(env.VITE_API_BASE_URL);
const assets = (await readdir("dist/assets")).filter((file) =>
  /\.(js|css)$/.test(file),
);
const { sw, manifest, enManifest } = createPwa(
  base,
  assets,
  await readFile("public/sw.js", "utf8"),
);
await writeFile("dist/sw.js", sw);
await writeFile("dist/manifest.webmanifest", JSON.stringify(manifest, null, 2));
await writeFile(
  "dist/manifest-en.webmanifest",
  JSON.stringify(enManifest, null, 2),
);
await writeFile("dist/.nojekyll", "");
// GitHub Pages does not interpret Cloudflare _headers. Supply a meta CSP too.
// Google Identity Services injects this exact stylesheet. Allow its hash
// instead of permitting arbitrary style blocks. Its layout also needs style
// attributes; inline scripts remain blocked. Recheck the hash on SDK changes.
const googleStyleHash = "sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw=";
const csp = `default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' https://accounts.google.com/gsi/style '${googleStyleHash}'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${api} https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`;
const html = await readFile("dist/index.html", "utf8");
await writeFile(
  "dist/index.html",
  html.replace(
    "<head>",
    `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`,
  ),
);
await writeFile(
  "dist/_headers",
  `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Content-Security-Policy: ${csp}; frame-ancestors 'none'\n${base}sw.js\n  Cache-Control: no-cache\n`,
);
