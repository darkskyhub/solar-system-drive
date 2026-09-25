const CACHE = "solar-system-drive-v20260926";

const SHELL = [
  "",
  "index.html",
  "scenic",
  "journey",
  "journey/pluto",
  "journey/neptune",
  "journey/uranus",
  "journey/saturn",
  "journey/jupiter",
  "journey/mars",
  "journey/earth",
  "journey/venus",
  "journey/mercury",
  "journey/sun",
  "park",
  "country",
  "tips",
];

const STATIC_FILES = [
  "manifest.webmanifest",
  "favicon.svg",
  "favicon-32.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "offline.html",
  "solar-system-drive-guide.pdf",
  "fonts/JTUSjIg69CK48gW7PXoo9Wlhyw.woff2",
  "fonts/JTUSjIg69CK48gW7PXoo9Wdhyzbi.woff2",
  "fonts/_Xms-HUzqDCFdgfMm4S9DQ.woff2",
  "fonts/_Xms-HUzqDCFdgfMm4q9DbZs.woff2",
  "fonts/_Xm9-HUzqDCFdgfMm4GnA4aZFrUvtOK3A7Yd-EI85A.woff2",
  "fonts/_Xm9-HUzqDCFdgfMm4GnA4aZFrUvtOK3A7Yd-Ew85FTy.woff2",
  "images/dsh-coin.jpg",
  "images/landscape.jpg",
  "images/cover.jpg",
  "images/aat-sunrise.png",
  "images/aat-day.jpg",
  "images/aat-night.png",
  "images/aat-guests.png",
  "images/pluto.png",
  "images/neptune.png",
  "images/uranus.png",
  "images/saturn.png",
  "images/jupiter.png",
  "images/mars.png",
  "images/earth.png",
  "images/venus.png",
  "images/mercury.png",
  "images/sun-board.png",
];

function scopeUrl() {
  return new URL(self.registration.scope);
}

function scopePath() {
  const path = scopeUrl().pathname;
  return path.endsWith("/") ? path : `${path}/`;
}

function abs(path) {
  return new URL(path, scopeUrl()).href;
}

function resolveRef(raw, baseHref) {
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("/")) {
    return new URL(raw, self.location.origin);
  }
  if (raw.startsWith("assets/")) return new URL(raw, scopeUrl());
  return new URL(raw, baseHref);
}

function inScope(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(scopePath());
}

function logMiss(url, detail) {
  console.warn("[solar-system-drive] cache miss", url, detail ?? "");
}

async function harvest(cache, text, baseHref) {
  const found = new Set();
  const attr = /(?:src|href)=["']([^"']+)["']/g;
  const cssUrl = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const quoted = /["'`]([^"'`]+\.(?:js|css|woff2))["'`]/g;
  let match;
  while ((match = attr.exec(text))) found.add(match[1]);
  while ((match = cssUrl.exec(text))) found.add(match[2]);
  while ((match = quoted.exec(text))) found.add(match[1]);
  const urls = [];
  for (const raw of found) {
    if (!raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("#")) continue;
    if (raw.includes("node_modules") || raw.includes("${")) continue;
    try {
      const url = resolveRef(raw, baseHref);
      if (!inScope(url)) continue;
      if (url.pathname.endsWith("/sw.js")) continue;
      urls.push(url.href);
    } catch {
      /* ignore bad urls */
    }
  }
  await Promise.all(urls.map((url) => putSafe(cache, url, true)));
}

const seen = new Set();

async function putSafe(cache, requestUrl, follow) {
  if (seen.has(requestUrl)) return false;
  seen.add(requestUrl);
  try {
    const res = await fetch(requestUrl, { cache: "no-cache" });
    const type = res.headers.get("content-type") || "";
    if (res.ok) {
      await cache.put(requestUrl, res.clone());
      if (
        follow &&
        (type.includes("text/html") ||
          type.includes("text/css") ||
          type.includes("javascript") ||
          requestUrl.endsWith(".js") ||
          requestUrl.endsWith(".css"))
      ) {
        await harvest(cache, await res.text(), requestUrl);
      }
      return true;
    }
    if (res.status === 404 && type.includes("text/html")) {
      const html = await res.text();
      if (html.includes("Solar System Drive") || html.includes("/assets/") || html.includes("assets/")) {
        const shell = new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
        await cache.put(requestUrl, shell);
        if (follow) await harvest(cache, html, requestUrl);
        return true;
      }
    }
    logMiss(requestUrl, res.status);
  } catch (error) {
    logMiss(requestUrl, error);
  }
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const paths = [];
      for (const path of SHELL) {
        paths.push(abs(path));
        if (path && !path.endsWith("/")) {
          paths.push(abs(`${path}/`));
          paths.push(abs(`${path}/index.html`));
        }
      }
      await Promise.all(paths.map((url) => putSafe(cache, url, true)));
      await Promise.all(STATIC_FILES.map((path) => putSafe(cache, abs(path), true)));
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

async function shellResponse() {
  return (
    (await caches.match(abs(""), { ignoreSearch: true })) ||
    (await caches.match(abs("index.html"), { ignoreSearch: true })) ||
    (await caches.match(scopeUrl().href, { ignoreSearch: true }))
  );
}

async function matchNavigation(req) {
  const url = new URL(req.url);
  const pathnames = [url.pathname];
  if (url.pathname.endsWith("/index.html")) {
    const trimmed = url.pathname.slice(0, -"/index.html".length);
    pathnames.push(trimmed.endsWith("/") ? trimmed : `${trimmed}/`);
  } else if (url.pathname.endsWith("/")) {
    pathnames.push(`${url.pathname}index.html`);
    if (url.pathname.length > 1) pathnames.push(url.pathname.slice(0, -1));
  } else {
    pathnames.push(`${url.pathname}/`);
    pathnames.push(`${url.pathname}/index.html`);
  }
  for (const pathname of pathnames) {
    const hit = await caches.match(new URL(pathname, url.origin).href, { ignoreSearch: true });
    if (hit) return hit;
  }
  return shellResponse();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!inScope(url)) return;
  if (url.pathname.includes("/api/") || url.pathname.includes("/_serverFn")) return;

  const isNavigate = req.mode === "navigate" || req.destination === "document";
  if (isNavigate) {
    event.respondWith(networkFirstNavigation(req));
    return;
  }
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
    }
    return res;
  } catch (error) {
    logMiss(req.url, error);
    return new Response("", { status: 503, statusText: "Offline" });
  }
}

async function networkFirstNavigation(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
      return res;
    }
    const cached = await matchNavigation(req);
    if (cached) return cached;
    if (res.status === 404) {
      const type = res.headers.get("content-type") || "";
      if (type.includes("text/html")) return res;
    }
    return res;
  } catch {
    const cached = await matchNavigation(req);
    if (cached) return cached;
    const offline = await caches.match(abs("offline.html"));
    if (offline) return offline;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}
