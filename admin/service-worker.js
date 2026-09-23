const CACHE_NAME = "bagira-admin-v3";

const FILES_TO_CACHE = [
  "./admin.html",
  "./manifest.json"
];


// ===============================
// УСТАНОВКА
// ===============================

self.addEventListener("install", (event) => {

  event.waitUntil(

    caches.open(CACHE_NAME)
      .then((cache) => {

        return cache.addAll(FILES_TO_CACHE);

      })

  );

  // Новая версия не ждёт закрытия старой
  self.skipWaiting();

});


// ===============================
// АКТИВАЦИЯ
// ===============================

self.addEventListener("activate", (event) => {

  event.waitUntil(

    caches.keys().then((cacheNames) => {

      return Promise.all(

        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))

      );

    })

  );

  // Сразу начинаем управлять открытой страницей
  self.clients.claim();

});


// ===============================
// ЗАПРОСЫ
// ===============================

self.addEventListener("fetch", (event) => {

  // Работаем только с GET
  if (event.request.method !== "GET") {
    return;
  }


  // HTML всегда сначала пытаемся получить из интернета
  if (event.request.mode === "navigate") {

    event.respondWith(

      fetch(event.request)
        .then((response) => {

          const responseClone =
            response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {

              cache.put(
                event.request,
                responseClone
              );

            });

          return response;

        })

        .catch(() => {

          return caches.match(
            event.request
          );

        })

    );

    return;
  }


  // Остальные файлы:
  // сначала интернет, при отсутствии сети — кэш
  event.respondWith(

    fetch(event.request)
      .then((response) => {

        return response;

      })
      .catch(() => {

        return caches.match(
          event.request
        );

      })

  );

});
