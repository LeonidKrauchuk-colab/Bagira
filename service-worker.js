const CACHE_NAME = "bagira-static-v6";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
];

const NETWORK_FIRST = [
  ".html",
  ".css",
  ".js",
  ".json",
];

const CACHE_FIRST = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
];


// ===============================
// УСТАНОВКА SERVICE WORKER
// ===============================

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});


// ===============================
// АКТИВАЦИЯ
// ===============================

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});


// ===============================
// ПРОВЕРКА РАСШИРЕНИЯ ФАЙЛА
// ===============================

function matchesExtension(url, extensions) {
  const pathname = new URL(url).pathname.toLowerCase();

  return extensions.some((ext) =>
    pathname.endsWith(ext)
  );
}


// ===============================
// NETWORK FIRST
// HTML / CSS / JS / JSON
// ===============================

async function networkFirst(request) {
  try {
    const response = await fetch(request);

    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);

      await cache.put(
        request,
        response.clone()
      );
    }

    return response;

  } catch (error) {

    const cached = await caches.match(request);

    if (cached) {
      return cached;
    }

    throw error;
  }
}


// ===============================
// CACHE FIRST
// КАРТИНКИ / ИКОНКИ / ШРИФТЫ
// ===============================

async function cacheFirst(request) {

  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }


  const response = await fetch(request);


  if (response && response.ok) {

    const cache =
      await caches.open(CACHE_NAME);

    await cache.put(
      request,
      response.clone()
    );

  }


  return response;
}


// ===============================
// HTML-СТРАНИЦА
// ВСЕГДА СНАЧАЛА СЕТЬ
// ===============================

async function handleNavigation(request) {

  try {

    const response =
      await fetch(request);


    if (response && response.ok) {

      const cache =
        await caches.open(CACHE_NAME);

      await cache.put(
        "./index.html",
        response.clone()
      );

    }


    return response;

  } catch (error) {

    return (
      (await caches.match(request)) ||
      (await caches.match("./index.html")) ||
      Response.error()
    );

  }
}


// ===============================
// ОБРАБОТКА ЗАПРОСОВ
// ===============================

self.addEventListener("fetch", (event) => {

  const request = event.request;


  // Только GET
  if (request.method !== "GET") {
    return;
  }


  const url =
    new URL(request.url);


  // Только файлы нашего сайта
  if (url.origin !== self.location.origin) {
    return;
  }


  // Страница сайта
  if (request.mode === "navigate") {

    event.respondWith(
      handleNavigation(request)
    );

    return;
  }


  // HTML / CSS / JS / JSON
  if (
    matchesExtension(
      request.url,
      NETWORK_FIRST
    )
  ) {

    event.respondWith(
      networkFirst(request)
    );

    return;
  }


  // Изображения / SVG / иконки / шрифты
  if (
    matchesExtension(
      request.url,
      CACHE_FIRST
    )
  ) {

    event.respondWith(
      cacheFirst(request)
    );

    return;
  }


  // Остальные файлы
  event.respondWith(
    networkFirst(request)
  );

});
