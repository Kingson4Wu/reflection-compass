const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const headers = ["authorization", "content-type"];
export function corsBoundary(request: Request, configured = "") {
  const origin = request.headers.get("Origin");
  const allowed = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const responseHeaders = new Headers({ Vary: "Origin" });
  const isAllowed =
    origin !== null &&
    (allowed.includes(origin) || origin === new URL(request.url).origin);
  if (isAllowed) responseHeaders.set("Access-Control-Allow-Origin", origin);
  const finish = (response: Response) => {
    const result = new Response(response.body, response);
    for (const [name, value] of responseHeaders)
      result.headers.set(name, value);
    return result;
  };
  if (origin && !isAllowed)
    return {
      finish,
      response: finish(
        Response.json({ error: "请求来源不匹配。" }, { status: 403 }),
      ),
    };
  if (request.method === "OPTIONS") {
    const method = request.headers.get("Access-Control-Request-Method") ?? "";
    const requested = (
      request.headers.get("Access-Control-Request-Headers") ?? ""
    )
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (
      !isAllowed ||
      !methods.includes(method) ||
      requested.some((value) => !headers.includes(value))
    )
      return { finish, response: finish(new Response(null, { status: 403 })) };
    responseHeaders.set("Access-Control-Allow-Methods", methods.join(", "));
    responseHeaders.set("Access-Control-Allow-Headers", headers.join(", "));
    responseHeaders.set("Access-Control-Max-Age", "600");
    return { finish, response: finish(new Response(null, { status: 204 })) };
  }
  return { finish };
}
