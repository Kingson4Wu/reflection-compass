import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const token = (await readFile(".dev.vars", "utf8")).match(
  /^OWNER_TOKEN=(.+)$/m,
)?.[1];
const base =
  (process.env.INTEGRATION_API_ORIGIN || "http://127.0.0.1:8787") + "/api/";
async function request(path, method = "GET", body, auth = true) {
  return fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
assert.equal((await request("state", "GET", undefined, false)).status, 401);
assert.equal((await request("data", "DELETE")).status, 200);
let current = await (await request("state")).json();
assert.equal(current.revision, 0);
current.state.direction.vision = "Integration test";
assert.equal((await request("state", "PUT", current)).status, 200);
assert.equal((await request("state", "PUT", current)).status, 409);
let stored = await (await request("state")).json();
assert.equal(stored.state.direction.vision, "Integration test");
assert.equal(stored.revision, 1);
const competing = await Promise.all([
  request("state", "PUT", stored),
  request("state", "PUT", stored),
]);
assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409]);
assert.equal(
  (
    await request("subscription", "POST", {
      endpoint: "https://localhost/private",
      keys: { p256dh: "x".repeat(87), auth: "x".repeat(22) },
    })
  ).status,
  400,
);
assert.equal((await request("push/test", "POST")).status, 400);
assert.equal((await request("data", "DELETE")).status, 200);
assert.equal((await (await request("state")).json()).revision, 0);
assert.deepEqual(await (await request("deliveries")).json(), []);
console.log(
  "D1 HTTP integration: authentication, read/write, stale and concurrent conflicts, endpoint validation, deletion passed.",
);
