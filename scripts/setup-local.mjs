import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, webcrypto } from "node:crypto";
const existing = await readFile(".dev.vars", "utf8").catch(() => "");
const values = Object.fromEntries(
  existing
    .split("\n")
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
values.OWNER_TOKEN ||= randomBytes(48).toString("base64url");
if (!values.VAPID_PUBLIC_KEY || !values.VAPID_PRIVATE_KEY) {
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
  values.VAPID_PUBLIC_KEY = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]).toString("base64url");
  values.VAPID_PRIVATE_KEY = jwk.d;
}
values.VAPID_SUBJECT ||= "mailto:you@example.com";
await writeFile(
  ".dev.vars",
  Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
console.log(
  "Local secrets saved to .dev.vars. Set VAPID_SUBJECT to your email before production. Secrets were not printed.",
);
