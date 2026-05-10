const CACHE_NAME = "mmars-pwa-v3";
const APP_SHELL = ["/", "/manifest.webmanifest", "/الأيقونة.png"];

const networkFirst = async (request, cacheKey = request) => {
  try {
    const response = await fetch(request);

    if (response && response.status === 200 && response.type === "basic") {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cacheKey, response.clone());
    }

    return response;
  } catch {
    const cachedResponse = await caches.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    return Response.error();
  }
};

const staleWhileRevalidate = async (request, cacheKey = request) => {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(cacheKey);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response && response.status === 200 && (response.type === "basic" || response.type === "default")) {
        await cache.put(cacheKey, response.clone());
      }

      return response;
    })
    .catch(() => cachedResponse ?? Response.error());

  return cachedResponse ?? networkPromise;
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(staleWhileRevalidate(event.request, "/"));
    return;
  }

  event.respondWith(networkFirst(event.request));
});

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "إشعار", message: event.data ? event.data.text() : "" };
  }

  const title = data.title || "إشعار";
  const options = {
    body: data.message || "",
    icon: "/الأيقونة.png",
    badge: "/الأيقونة.png",
    dir: "rtl",
    lang: "ar",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : "/";
  const fullUrl = targetUrl.startsWith("http") ? targetUrl : self.location.origin + targetUrl;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && "navigate" in client) {
            return client.navigate(fullUrl).then((c) => c && c.focus ? c.focus() : undefined);
          }
        }

        return clients.openWindow ? clients.openWindow(fullUrl) : undefined;
      }),
  );
});