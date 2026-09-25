const CACHE_NAME = "bagira-admin-v6";

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

  // Новая версия сразу становится активной
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

    }).then(() => {

      // Сразу начинаем управлять открытой страницей
      return self.clients.claim();

    }).then(() => {

      // Сообщаем открытым страницам,
      // что новая версия Service Worker активирована
      return self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

    }).then((clients) => {

      clients.forEach((client) => {

        client.postMessage({
          type: "UPDATE_AVAILABLE"
        });

      });

    })

  );

});


// ===============================
// ЗАПРОСЫ
// ===============================

self.addEventListener("fetch", (event) => {

  // Работаем только с GET
  if (event.request.method !== "GET") {
    return;
  }


  // ===============================
  // HTML
  // ===============================

  // HTML всегда сначала пытаемся получить из интернета
  if (event.request.mode === "navigate") {

    event.respondWith(

      fetch(event.request)
        .then((response) => {

          const responseClone = response.clone();

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

          // Если интернета нет —
          // используем сохранённую страницу
          return caches.match(event.request);

        })

    );

    return;
  }


  // ===============================
  // ОСТАЛЬНЫЕ ФАЙЛЫ
  // ===============================

  // Сначала интернет,
  // при отсутствии сети — кэш

  event.respondWith(

    fetch(event.request)
      .then((response) => {

        return response;

      })

      .catch(() => {

        return caches.match(event.request);

      })

  );

});
