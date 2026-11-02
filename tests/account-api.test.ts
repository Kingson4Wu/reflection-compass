import { it, expect } from "vitest";
import { database } from "./helpers/database";
import { handleRequest } from "../worker/index";
import { inviteMember, acceptIdentity } from "../worker/members";
import { registerDevice } from "../worker/devices";
import { privateDatabase } from "../worker/tenancy";
import { hashSecret } from "../worker/auth";
it("scopes member API state and forbids member administration; revokes deleted accounts", async () => {
  const DB = await database();
  await inviteMember(DB, "friend@gmail.com");
  const user = await acceptIdentity(
    DB,
    { sub: "f", email: "friend@gmail.com", name: "Friend" },
    false,
  );
  const device = await registerDevice(
    privateDatabase(DB, user.seat),
    { owner: true },
    { id: "friend-device", name: "Phone" },
  );
  await DB.prepare("INSERT INTO login_sessions VALUES(?,?,?,?)")
    .bind(
      await hashSecret(device.token!),
      user.id,
      device.id,
      Date.now() + 60000,
    )
    .run();
  const env = { DB, OWNER_TOKEN: "o".repeat(48) } as Parameters<
    typeof handleRequest
  >[1];
  const call = (
    path: string,
    token = device.token!,
    method = "GET",
    body?: unknown,
  ) =>
    handleRequest(
      new Request("https://app.test/api/" + path, {
        method,
        headers: { Authorization: "Bearer " + token },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
  expect(
    (
      await call("sync", device.token, "POST", {
        operations: [
          {
            id: "edit",
            key: "direction:vision",
            base: "",
            value: "private friend",
          },
        ],
      })
    ).status,
  ).toBe(200);
  expect((await (await call("state")).json()).state.direction.vision).toBe(
    "private friend",
  );
  expect(
    (await (await call("state", env.OWNER_TOKEN)).json()).state.direction
      .vision,
  ).toBe("");
  expect((await call("members")).status).toBe(403);
  expect(
    (await call("members", device.token, "POST", { email: "bad@gmail.com" }))
      .status,
  ).toBe(403);
  await call("data", device.token, "DELETE");
  expect((await call("state")).status).toBe(401);
  expect((await call("state", env.OWNER_TOKEN)).status).toBe(200);
});
it("refuses expired member sessions and protects owner binding challenges", async () => {
  const DB = await database();
  await inviteMember(DB, "expiry@gmail.com");
  const user = await acceptIdentity(
    DB,
    { sub: "expiry", email: "expiry@gmail.com", name: "Expired" },
    false,
  );
  const device = await registerDevice(
    privateDatabase(DB, user.seat),
    { owner: true },
    { id: "expiry-device", name: "Phone" },
  );
  await DB.prepare("INSERT INTO login_sessions VALUES(?,?,?,?)")
    .bind(await hashSecret(device.token!), user.id, device.id, 0)
    .run();
  const env = {
    DB,
    OWNER_TOKEN: "o".repeat(48),
    GOOGLE_CLIENT_ID: "client",
  } as Parameters<typeof handleRequest>[1];
  const read = await handleRequest(
    new Request("https://app.test/api/state", {
      headers: { Authorization: "Bearer " + device.token },
    }),
    env,
  );
  expect(read.status).toBe(401);
  const link = await handleRequest(
    new Request("https://app.test/api/auth/challenge", {
      method: "POST",
      body: JSON.stringify({ verifier: "a".repeat(64), linkOwner: true }),
    }),
    env,
  );
  expect(link.status).toBe(403);
});
