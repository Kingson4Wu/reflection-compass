import { createHash } from "node:crypto";
import { normalizeBase } from "./deployment.mjs";
/** @param {string} base @param {string[]} assets @param {string} source */
export function createPwa(base, assets, source) {
  base = normalizeBase(base);
  const manifest = {
    id: base,
    name: "Reflection Compass",
    short_name: "Compass",
    lang: "zh-CN",
    start_url: base,
    scope: base,
    display: "standalone",
    background_color: "#f2f5f8",
    theme_color: "#f2f5f8",
    icons: [192, 512].map((size) => ({
      src: `${base}icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any maskable",
    })),
  };
  const precache = [
    base,
    ...[
      "manifest.webmanifest",
      "manifest-en.webmanifest",
      "icon-32.png",
      "icon-192.png",
      "icon-512.png",
    ].map((file) => base + file),
    ...assets.map((file) => base + "assets/" + file),
  ];
  const hash = createHash("sha256")
    .update(source + JSON.stringify(precache))
    .digest("hex")
    .slice(0, 12);
  const sw = source
    .replace("BUILD_VERSION", hash)
    .replace(
      /const PRECACHE = \[[\s\S]*?\];/,
      `const PRECACHE = ${JSON.stringify(precache)};`,
    );
  if (!precache.every((asset) => sw.includes(asset)))
    throw new Error("Service worker precache generation failed");
  return {
    manifest,
    enManifest: {
      ...manifest,
      name: "Reflection Compass",
      short_name: "Compass",
      lang: "en",
    },
    sw,
  };
}
