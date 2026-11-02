import { readFile, writeFile } from "node:fs/promises";
import { parse, printParseErrorCode } from "jsonc-parser";
const errors = [];
const config = parse(await readFile("wrangler.jsonc", "utf8"), errors, {
  allowTrailingComma: true,
});
if (errors.length)
  throw new Error(
    "Invalid Wrangler JSONC: " +
      errors.map((error) => printParseErrorCode(error.error)).join(", "),
  );
const id = process.env.CLOUDFLARE_D1_DATABASE_ID;
const origins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (
  !id ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
  id === "00000000-0000-0000-0000-000000000000"
)
  throw new Error(
    "Set CLOUDFLARE_D1_DATABASE_ID to your created database UUID",
  );
if (
  !origins.length ||
  origins.some((value) => {
    try {
      const url = new URL(value);
      return url.protocol !== "https:" || url.origin !== value;
    } catch {
      return true;
    }
  })
)
  throw new Error(
    "Set ALLOWED_ORIGINS to comma-separated HTTPS origins without trailing slashes or paths",
  );
config.d1_databases[0].database_id = id;
config.vars.ALLOWED_ORIGINS = origins.join(",");
await writeFile("wrangler.deploy.json", JSON.stringify(config, null, 2) + "\n");
console.log("Prepared backend configuration; no frontend assets are included.");
