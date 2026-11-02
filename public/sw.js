const APP_ROOT = new URL("./", self.location.href);
const CACHE_PREFIX = `compass-shell:${APP_ROOT.pathname}:`;
const CACHE = CACHE_PREFIX + "BUILD_VERSION";
const PRECACHE = [];
const appUrl = (path = "") => new URL(path, APP_ROOT).href;
function applicationUrl(value) {
  const url = new URL(value || "?view=reflect", APP_ROOT);
  return url.origin === APP_ROOT.origin &&
    url.pathname.startsWith(APP_ROOT.pathname)
    ? url
    : null;
}
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== APP_ROOT.origin ||
    !url.pathname.startsWith(APP_ROOT.pathname) ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (
    event.request.mode === "navigate" &&
    [APP_ROOT.pathname, APP_ROOT.pathname + "index.html"].includes(url.pathname)
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches
                .open(CACHE)
                .then((cache) => cache.put(APP_ROOT.href, copy)),
            );
          }
          return response;
        })
        .catch(() => caches.match(APP_ROOT.href)),
    );
    return;
  }
  // These are public, same-origin build assets; Vary: Origin must not prevent
  // anonymous module/style requests from using their pre-cached responses.
  if (PRECACHE.includes(url.pathname))
    event.respondWith(
      caches.match(event.request, { ignoreVary: true }).then(
        (hit) =>
          hit ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              event.waitUntil(
                caches
                  .open(CACHE)
                  .then((cache) => cache.put(event.request, copy)),
              );
            }
            return response;
          }),
      ),
    );
});
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(
      data.title || (data.lang === "en" ? "Take a moment" : "给自己一次停顿"),
      {
        body:
          data.body ||
          (data.lang === "en"
            ? "Open the app and reconnect with your direction."
            : "打开应用，看看今天的方向。"),
        lang: data.lang === "en" ? "en" : "zh-CN",
        icon: appUrl("icon-192.png"),
        badge: appUrl("icon-192.png"),
        tag: data.tag || "compass",
        data: { url: data.url || "?view=reflect" },
      },
    ),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let url;
  try {
    url = applicationUrl(event.notification.data?.url);
  } catch {
    return;
  }
  if (!url) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const client = clients.find((client) => {
          try {
            return !!applicationUrl(client.url);
          } catch {
            return false;
          }
        });
        if (client) {
          await client.navigate(url.href);
          return client.focus();
        }
        return self.clients.openWindow(url.href);
      }),
  );
});
