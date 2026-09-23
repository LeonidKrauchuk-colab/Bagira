const CACHE_NAME = "bagira-admin-v2";

const FILES_TO_CACHE = [
  "./admin.html",
  "./manifest.json"
];


// Установка нового Service Worker
self.addEventListener("install", (event) => {

  event.waitUntil(

    caches.open(CACHE_NAME)
      .then((cache) => {

        return cache.addAll(FILES_TO_CACHE);

      })

  );

  // Не ждём закрытия старой версии
  self.skipWaiting();

});


// Активация новой версии
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

  // Сразу начинаем управлять страницей
  self.clients.claim();

});


// Работа с запросами
self.addEventListener("fetch", (event) => {

  // Для HTML сначала пытаемся получить свежую версию из интернета
  if (
    event.request.mode === "navigate"
  ) {

    event.respondWith(

      fetch(event.request)
        .then((response) => {

          // Сохраняем свежую страницу
          const responseClone =
            response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {

              cache.put(
                "./admin.html",
                responseClone
              );

            });

          return response;

        })
        .catch(() => {

          // Если интернета нет —
          // используем сохранённую версию
          return caches.match(
            "./admin.html"
          );

        })

    );

    return;

  }


  // CSS, JS, картинки и остальные ресурсы
  // сначала загружаем из сети.
  // Если сети нет — пробуем кэш.
  event.respondWith(

    fetch(event.request)
      .catch(() => {

        return caches.match(
          event.request
        );

      })

  );

});
