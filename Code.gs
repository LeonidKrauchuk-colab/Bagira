// ============================================================
// МАСТЕРСКАЯ «БАГИРА»
// GOOGLE APPS SCRIPT
//
// Функции:
// 1. Получение записей для сайта и админ-панели
// 2. Создание записи с сайта
// 3. Добавление записи из админ-панели
// 4. Редактирование записи из админ-панели
// 5. Отмена записи из админ-панели
// 6. Удаление записи из админ-панели
// 7. Проверка занятости времени
// 8. Подтверждение и отмена новых записей из Telegram
//
// Telegram-кнопки переводят заявку в активную или отменённую запись.
// ============================================================



// ============================================================
// НАСТРОЙКИ
// ============================================================

const SHEET_NAME = "Записи";

// Адрес рабочего развёртывания: общий для сайта, админки и Telegram.
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz7YOsw9YSwHQNqO9MVr0DrLiabp9JSwzVSNidAToAVGnNvi-IAR66Cyx0SexrIjKVZ/exec";

const TELEGRAM_BOT_TOKEN_PROPERTY =
  "TELEGRAM_BOT_TOKEN";
const TELEGRAM_WEBHOOK_SECRET_PROPERTY = "TELEGRAM_WEBHOOK_SECRET";

// ============================================================
// TELEGRAM АВТОРИЗАЦИЯ АДМИН-ПАНЕЛИ
// ============================================================

const ADMIN_TELEGRAM_USER_ID_PROPERTY =
  "ADMIN_TELEGRAM_USER_ID";

const MASTER_TELEGRAM_USER_ID_PROPERTY = "MASTER_TELEGRAM_USER_ID";
// Временно отключено. Для возврата сообщений мастеру установите true.
const MASTER_TELEGRAM_NOTIFICATIONS_ENABLED = false;

// ============================================================
// GET
// ============================================================

function doGet(e) {

  try {

    if (e && e.parameter && e.parameter.authConfig === "1") {
      return jsonResponse(getTelegramLoginConfig());
    }

    const sheet = getSheet();
    const availabilityRequested = String(e && e.parameter && e.parameter.availability || "") === "1";
    if (availabilityRequested) {
      return jsonResponse(getNearestAvailability(sheet));
    }
    const requestedDate = String(e && e.parameter && e.parameter.date || "");
    const bookings = requestedDate
      ? getBookings(sheet).filter(function(booking) {
          return booking.date === requestedDate;
        }).map(function(booking) {
          return { date: booking.date, time: booking.time, status: booking.status };
        })
      : [];
    const closedDays = getClosedDays();
    const scheduleSettings = getScheduleSettings();
    const timezone = Session.getScriptTimeZone();
    const now = new Date();

    return jsonResponse({
      success: true,
      bookings: bookings,
      closedDays: closedDays,
      scheduleSettings: scheduleSettings,
      today: Utilities.formatDate(now, timezone, "yyyy-MM-dd"),
      currentTime: Utilities.formatDate(now, timezone, "HH:mm")
    });

  } catch (error) {

    return jsonResponse({
      success: false,
      error: error.message
    });

  }

}



// ============================================================
// БЛИЖАЙШИЕ СВОБОДНЫЕ ОКНА
// ============================================================

function getNearestAvailability(sheet) {
  const settings = getScheduleSettings();
  const closedDays = getClosedDays();
  const timezone = Session.getScriptTimeZone();
  const now = new Date();
  const today = Utilities.formatDate(now, timezone, "yyyy-MM-dd");
  const currentTime = Utilities.formatDate(now, timezone, "HH:mm");
  const maxDays = Math.min(365, Math.max(1, Number(settings.bookingDays) || 20));
  const busySlots = {};

  getBookings(sheet).forEach(function(booking) {
    if (booking.status === "Отменена" || booking.date < today) return;
    if (!busySlots[booking.date]) busySlots[booking.date] = {};
    busySlots[booking.date][String(booking.time || "").slice(0, 5)] = true;
  });

  const slots = [];
  const todayUtc = new Date(today + "T00:00:00Z");
  for (let offset = 0; offset <= maxDays && slots.length < 6; offset += 1) {
    const date = new Date(todayUtc);
    date.setUTCDate(date.getUTCDate() + offset);
    const dateString = date.toISOString().slice(0, 10);
    if (closedDays.indexOf(dateString) !== -1) continue;

    const schedule = getScheduleForDate(dateString, settings);
    const times = schedule && Array.isArray(schedule.slots) ? schedule.slots : [];
    for (let index = 0; index < times.length && slots.length < 6; index += 1) {
      const time = String(times[index]).slice(0, 5);
      if (dateString === today && time <= currentTime) continue;
      if (busySlots[dateString] && busySlots[dateString][time]) continue;
      slots.push({ date: dateString, time: time });
    }
  }

  return {
    success: true,
    slots: slots,
    closedDays: closedDays,
    scheduleSettings: settings,
    today: today,
    currentTime: currentTime
  };
}



// ============================================================
// POST
// ============================================================

function doPost(e) {

  try {

    if (!e || !e.postData) {

      return jsonResponse({
        success: false,
        error: "Нет данных запроса"
      });

    }


    const data =
      JSON.parse(e.postData.contents || "{}");

    if (data.action === "telegramAdminLogin") return jsonResponse(loginTelegramAdmin(data.telegramAuth));
    if (data.action === "logoutAdmin") return jsonResponse(logoutTelegramAdmin(data.sessionToken));

    // ContentService redirects JSON responses; Telegram needs a direct acknowledgement.
    if (data && (data.callback_query || data.message || data.action === "diagnoseWebhookTransport")) {
      return handleTelegramWebhook(data, e);
    }
// --------------------------------------------------------
// ПРОВЕРКА ДОСТУПА АДМИНИСТРАТОРА
// --------------------------------------------------------

if (
  data.action === "checkAdminAccess"
) {

  const allowed =
    checkTelegramAdminAccess(
      data.sessionToken
    );

  return jsonResponse({

    success: allowed,

    error: allowed
      ? ""
      : "Сессия истекла или доступ запрещён. Войдите через Telegram."

  });

}

    // --------------------------------------------------------
    // НАСТРОЙКА ВЫХОДНЫХ ДНЕЙ
    // --------------------------------------------------------
    if (data.action === "setClosedDays") {
      if (!checkTelegramAdminAccess(data.sessionToken)) {
        return jsonResponse({ success: false, code: "AUTH_REQUIRED", error: "Сессия истекла или доступ запрещён. Войдите через Telegram." });
      }
      return jsonResponse(setClosedDays(data.dates));
    }

    if (data.action === "setScheduleSettings") {
      if (!checkTelegramAdminAccess(data.sessionToken)) {
        return jsonResponse({ success: false, code: "AUTH_REQUIRED", error: "Сессия истекла или доступ запрещён. Войдите через Telegram." });
      }
      return jsonResponse(setScheduleSettings(data.settings));
    }

    // --------------------------------------------------------
    // АДМИНСКИЕ ДЕЙСТВИЯ
    // --------------------------------------------------------

    if (
      data.action === "addAdminBooking" ||
      data.action === "updateAdminBooking" ||
      data.action === "cancelAdminBooking" ||
      data.action === "deleteAdminBooking"
    ) {

      if (!checkTelegramAdminAccess(data.sessionToken)) {

        return jsonResponse({
          success: false,
          code: "AUTH_REQUIRED", error: "Сессия истекла или доступ запрещён. Войдите через Telegram."
        });

      }


      if (
        data.action === "addAdminBooking"
      ) {

        return jsonResponse(
          addAdminBooking(data)
        );

      }


      if (
        data.action === "updateAdminBooking"
      ) {

        return jsonResponse(
          updateAdminBooking(data)
        );

      }


      if (
        data.action === "cancelAdminBooking"
      ) {

        return jsonResponse(
          cancelAdminBooking(data.id)
        );

      }


      if (
        data.action === "deleteAdminBooking"
      ) {

        return jsonResponse(
          deleteAdminBooking(data.id)
        );

      }

    }

// --------------------------------------------------------
// ПОЛУЧЕНИЕ ЗАПИСЕЙ ДЛЯ АДМИН-ПАНЕЛИ
// --------------------------------------------------------

if (
  data.action === "getAdminBookings"
) {

  if (!checkTelegramAdminAccess(data.sessionToken)) {

    return jsonResponse({
      success: false,
      code: "AUTH_REQUIRED", error: "Сессия истекла или доступ запрещён. Войдите через Telegram."
    });

  }

  const sheet = getSheet();

  const bookings = getBookings(sheet);

  return jsonResponse({
    success: true,
    bookings: bookings
  });

}

    // --------------------------------------------------------
    // НОВАЯ ЗАПИСЬ С САЙТА
    // --------------------------------------------------------

    if (
      data.action === "createBooking" ||
      data.mode === "createBooking" ||
      (
        data.name &&
        data.phone &&
        data.service &&
        data.date &&
        data.time
      )
    ) {

      return jsonResponse(
        createBooking(data)
      );

    }



    return jsonResponse({

      success: false,

      error:
        "Неизвестная команда"

    });


  } catch (error) {

    return jsonResponse({

      success: false,

      error:
        error.message

    });

  }

}



// ============================================================
// JSON RESPONSE
// ============================================================

function telegramWebhookResponse(result) {
  return HtmlService.createHtmlOutput(result && result.success === false ? "ERROR" : "OK");
}

function handleTelegramWebhook(data, event) {
  if (!checkTelegramWebhookAccess(event)) {
    return telegramWebhookResponse({ success: false });
  }
  try {
    let result = { success: true };
    if (data.callback_query) {
      const callback = data.callback_query;
      const action = String(callback.data || "");
      result = action.indexOf("admin_") === 0
        ? handleStaffTelegramCallback(callback, event)
        : action.indexOf("client_") === 0
          ? handleClientTelegramCallback(callback, event)
          : handleTelegramBookingCallback(callback, event);
    } else if (data.message) {
      result = dispatchTelegramMessage(data.message, event);
    }
    if (result && result.success === false) console.error("Telegram update handler failed: " + String(result.error || "Unknown error"));
    return telegramWebhookResponse(result);
  } catch (error) {
    console.error("Telegram webhook handler failed: " + error.message);
    return telegramWebhookResponse({ success: false });
  }
}

function jsonResponse(data) {

  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );

}



// ============================================================
// ПОЛУЧИТЬ ТАБЛИЦУ
// ============================================================

function getSheet() {

  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();


  if (!spreadsheet) {

    throw new Error(
      "Не удалось получить Google Таблицу"
    );

  }


  let sheet =
    spreadsheet.getSheetByName(
      SHEET_NAME
    );


  if (!sheet) {

    sheet =
      spreadsheet.getSheets()[0];

  }


  if (!sheet) {

    throw new Error(
      "Лист Google Таблицы не найден"
    );

  }


  return sheet;

}



// ============================================================
// ПОЛУЧИТЬ ВСЕ ЗАПИСИ
// ============================================================

function getBookings(sheet) {

  if (!sheet) {

    sheet = getSheet();

  }


  const lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {

    return [];

  }


  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        12
      )
      .getValues();


  return values.map(
    function(row) {

      return {

        id:
          String(row[0] || ""),

        name:
          String(row[1] || ""),

        phone:
          String(row[2] || ""),

        telegram:
          String(row[3] || ""),

        service:
          String(row[4] || ""),

        date:
          normalizeDate(row[5]),

        time:
          normalizeTime(row[6]),

        comment:
          String(row[7] || ""),

        status:
          String(row[8] || ""),

        createdAt:
          normalizeCreatedAt(row[9]),

        adminTelegramMessageId: String(row[10] || ""),

        masterTelegramMessageId: String(row[11] || "")

      };

    }
  );

}



// ============================================================
// СОЗДАНИЕ ЗАПИСИ С САЙТА
// ============================================================

function createBooking(data, clientChatId) {

  const lock =
    LockService.getScriptLock();


  lock.waitLock(10000);


  try {

    // --------------------------------------------------------
    // Проверка обязательных полей
    // --------------------------------------------------------

    if (
      !data.name ||
      !data.phone ||
      !data.service ||
      !data.date ||
      !data.time
    ) {

      return {

        success: false,

        error:
          "Заполнены не все обязательные поля"

      };

    }


    const sheet =
      getSheet();


    const bookings =
      getBookings(sheet);

    if (!isBookingDateAllowed(data.date)) {
      return { success: false, error: "Запись доступна только в пределах установленного периода." };
    }
    if (isClosedDay(data.date)) {
      return { success: false, error: "На выбранную дату запись не принимается. Пожалуйста, выберите другой день." };
    }
    if (!isBookingTimeAllowed(data.time, data.date)) {
      return { success: false, error: "Выберите время из доступных слотов." };
    }
    if (isPastBookingTime(data.date, data.time)) {
      return { success: false, error: "Это время уже прошло. Выберите свободное время позже." };
    }

    // --------------------------------------------------------
    // Проверяем занятость
    // --------------------------------------------------------

    const alreadyBooked =
      bookings.some(
        function(booking) {

          return (

            booking.date ===
              String(data.date)

            &&

            booking.time ===
              String(data.time)

            &&

            booking.status !==
              "Отменена"

          );

        }
      );


    if (alreadyBooked) {

      return {

        success: false,

        error:
          "Это время уже занято"

      };

    }


    // --------------------------------------------------------
    // ID
    // --------------------------------------------------------

    const id =
      Utilities.getUuid();


    // --------------------------------------------------------
    // Дата создания
    // --------------------------------------------------------

    const createdAt =
      new Date();


    // --------------------------------------------------------
    // Данные строки
    // --------------------------------------------------------

    const row = [

      id,

      data.name || "",

      data.phone || "",

      data.telegram || "",

      data.service || "",

      data.date || "",

      data.time || "",

      data.comment || "",

      "Ожидает подтверждения",

      createdAt,

      "",

      ""

    ];


    // --------------------------------------------------------
    // Следующая строка
    // --------------------------------------------------------

    const nextRow =
      sheet.getLastRow() + 1;


    // Телефон сохраняем как текст
    sheet
      .getRange(
        nextRow,
        3
      )
      .setNumberFormat("@");


    // Записываем строку
    sheet
      .getRange(
        nextRow,
        1,
        1,
        12
      )
      .setValues([
        row
      ]);

    if (clientChatId) {
      PropertiesService.getScriptProperties().setProperty(
        "BOOKING_CLIENT_CHAT_" + id,
        String(clientChatId)
      );
    }


    // Формат даты создания
    sheet
      .getRange(
        nextRow,
        10
      )
      .setNumberFormat(
        "dd.MM.yyyy HH:mm:ss"
      );


    // --------------------------------------------------------
    // TELEGRAM
    // Только уведомление
    // --------------------------------------------------------

    try {

      sendNewBookingTelegram({

        id:
          id,

        name:
          data.name,

        phone:
          data.phone,

        telegram:
          data.telegram,

        service:
          data.service,

        date:
          data.date,

        time:
          data.time,

        comment:
          data.comment,

        rowNumber:
          nextRow

      });

    } catch (telegramError) {

      // Ошибка Telegram НЕ отменяет запись

      console.error(
        "Ошибка Telegram: " +
        telegramError.message
      );

    }


    return {

      success: true,

      id:
        id,

      message:
        "Запись успешно создана"

    };


  } finally {

    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }

  }

}



// ============================================================
// ДОБАВЛЕНИЕ ИЗ АДМИН-ПАНЕЛИ
// ============================================================

function addAdminBooking(data) {

  const lock =
    LockService.getScriptLock();


  lock.waitLock(10000);


  try {

    if (
      !data.name ||
      !data.phone ||
      !data.service ||
      !data.date ||
      !data.time
    ) {

      return {

        success: false,

        error:
          "Заполнены не все обязательные поля"

      };

    }


    const sheet =
      getSheet();

    if (isClosedDay(data.date)) {
      return { success: false, error: "Выбранный день отмечен как выходной" };
    }
    if (!isBookingTimeAllowed(data.time, data.date)) {
      return { success: false, error: "Выберите время из доступных слотов." };
    }

    if (
      isTimeBusy(
        data.date,
        data.time,
        null
      )
    ) {

      return {

        success: false,

        error:
          "Это время уже занято"

      };

    }


    const id =
      Utilities.getUuid();


    const createdAt =
      new Date();


    const row = [

      id,

      data.name || "",

      data.phone || "",

      data.telegram || "",

      data.service || "",

      data.date || "",

      data.time || "",

      data.comment || "",

      "Активна",

      createdAt,

      "",

      ""

    ];


    const nextRow =
      sheet.getLastRow() + 1;


    sheet
      .getRange(
        nextRow,
        3
      )
      .setNumberFormat("@");


    sheet
      .getRange(
        nextRow,
        1,
        1,
        12
      )
      .setValues([
        row
      ]);


    sheet
      .getRange(
        nextRow,
        10
      )
      .setNumberFormat(
        "dd.MM.yyyy HH:mm:ss"
      );


    return {

      success: true,

      id:
        id,

      message:
        "Запись добавлена"

    };


  } finally {

    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }

  }

}



// ============================================================
// РЕДАКТИРОВАНИЕ ИЗ АДМИН-ПАНЕЛИ
// ============================================================

function updateAdminBooking(data) {

  if (!data.id) {

    return {

      success: false,

      error:
        "Не указан ID записи"

    };

  }


  return updateAdminBookingInternal({

    id:
      data.id,

    name:
      data.name,

    phone:
      data.phone,

    telegram:
      data.telegram,

    service:
      data.service,

    date:
      data.date,

    time:
      data.time,

    comment:
      data.comment

  });

}



// ============================================================
// ВНУТРЕННЕЕ РЕДАКТИРОВАНИЕ
// ============================================================

function updateAdminBookingInternal(data) {
  return withBookingLock(function() { return updateAdminBookingInternalLocked(data); });
}

function updateAdminBookingInternalLocked(data) {

  const sheet =
    getSheet();


  const booking =
    findBookingById(
      data.id
    );


  if (!booking) {

    return {

      success: false,

      error:
        "Запись не найдена"

    };

  }


  // --------------------------------------------------------
  // Если меняются дата или время,
  // проверяем занятость
  // --------------------------------------------------------

  const newDate =
    data.date !== undefined &&
    data.date !== null
      ? String(data.date)
      : booking.date;


  const newTime =
    data.time !== undefined &&
    data.time !== null
      ? String(data.time)
      : booking.time;

  if ((newTime !== booking.time || newDate !== booking.date) && !isBookingTimeAllowed(newTime, newDate)) {
    return { success: false, error: "Выберите время из доступных слотов." };
  }


  if (newDate !== booking.date && isClosedDay(newDate)) {
    return { success: false, error: "Выбранный день отмечен как выходной" };
  }

  if (
    isTimeBusy(
      newDate,
      newTime,
      data.id
    )
  ) {

    return {

      success: false,

      error:
        "Это время уже занято"

    };

  }


  // --------------------------------------------------------
  // Находим строку
  // --------------------------------------------------------

  const rowNumber =
    booking.rowNumber;


  // --------------------------------------------------------
  // Обновляем только переданные поля
  // --------------------------------------------------------

  if (
    data.name !== undefined
  ) {

    sheet
      .getRange(
        rowNumber,
        2
      )
      .setValue(
        data.name
      );

  }


  if (
    data.phone !== undefined
  ) {

    sheet
      .getRange(
        rowNumber,
        3
      )
      .setNumberFormat("@");

    sheet
      .getRange(
        rowNumber,
        3
      )
      .setValue(
        data.phone
      );

  }


  if (
    data.telegram !== undefined
  ) {

    sheet
      .getRange(
        rowNumber,
        4
      )
      .setValue(
        data.telegram
      );

  }


  if (
    data.service !== undefined
  ) {

    sheet
      .getRange(
        rowNumber,
        5
      )
      .setValue(
        data.service
      );

  }


  if (
    data.date !== undefined
  ) {

    sheet
      .getRange(
        rowNumber,
        6
      )
      .setValue(
        data.date
      );

  }


  if (
    data.time !== undefined
  ) {

    sheet
      .getRange(
        rowNumber,
        7
      )
      .setValue(
        data.time
      );

  }


  if (
    data.comment !== undefined
  ) {

    sheet
      .getRange(
        rowNumber,
        8
      )
      .setValue(
        data.comment
      );

  }


  return {

    success: true,

    message:
      "Запись изменена"

  };

}



// ============================================================
// ОТМЕНА ЗАПИСИ
// ============================================================

function cancelAdminBooking(id) {
  return withBookingLock(function() { return cancelAdminBookingLocked(id); });
}

function cancelAdminBookingLocked(id) {

  if (!id) {

    return {

      success: false,

      error:
        "Не указан ID записи"

    };

  }


  const sheet =
    getSheet();


  const booking =
    findBookingById(id);


  if (!booking) {

    return {

      success: false,

      error:
        "Запись не найдена"

    };

  }


  sheet
    .getRange(
      booking.rowNumber,
      9
    )
    .setValue(
      "Отменена"
    );


  return {

    success: true,

    message:
      "Запись отменена"

  };

}



// ============================================================
// УДАЛЕНИЕ ЗАПИСИ
// ============================================================

function deleteAdminBooking(id) {
  return withBookingLock(function() { return deleteAdminBookingLocked(id); });
}

function deleteAdminBookingLocked(id) {

  if (!id) {

    return {

      success: false,

      error:
        "Не указан ID записи"

    };

  }


  const sheet =
    getSheet();


  const booking =
    findBookingById(id);


  if (!booking) {

    return {

      success: false,

      error:
        "Запись не найдена"

    };

  }


  sheet.deleteRow(
    booking.rowNumber
  );


  return {

    success: true,

    message:
      "Запись удалена"

  };

}



// ============================================================
// НАЙТИ ЗАПИСЬ ПО ID
// ============================================================

function findBookingById(id) {

  if (!id) {

    return null;

  }


  const sheet =
    getSheet();


  const lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {

    return null;

  }


  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        12
      )
      .getValues();


  for (
    let i = 0;
    i < values.length;
    i++
  ) {

    const row =
      values[i];


    if (
      String(row[0] || "") ===
      String(id)
    ) {

      return {

        id:
          String(row[0] || ""),

        name:
          String(row[1] || ""),

        phone:
          String(row[2] || ""),

        telegram:
          String(row[3] || ""),

        service:
          String(row[4] || ""),

        date:
          normalizeDate(row[5]),

        time:
          normalizeTime(row[6]),

        comment:
          String(row[7] || ""),

        status:
          String(row[8] || ""),

        createdAt:
          normalizeCreatedAt(row[9]),

        rowNumber:
          i + 2,

        adminTelegramMessageId: String(row[10] || ""),

        masterTelegramMessageId: String(row[11] || "")

      };

    }

  }


  return null;

}



// ============================================================
// ПРОВЕРКА ЗАНЯТОСТИ ВРЕМЕНИ
//
// cancelled записи НЕ считаются занятыми.
// excludeId нужен при редактировании собственной записи.
// ============================================================

function isTimeBusy(
  date,
  time,
  excludeId
) {

  const sheet =
    getSheet();


  const bookings =
    getBookings(sheet);


  const targetDate =
    normalizeDate(date);


  const targetTime =
    normalizeTime(time);


  return bookings.some(
    function(booking) {

      // Отменённые записи свободны
      if (
        booking.status ===
        "Отменена"
      ) {

        return false;

      }


      // При редактировании
      // собственную запись исключаем
      if (
        excludeId &&
        String(booking.id) ===
        String(excludeId)
      ) {

        return false;

      }


      return (

        booking.date ===
        targetDate

        &&

        booking.time ===
        targetTime

      );

    }
  );

}



// ============================================================
// ПРОВЕРКА ADMIN API TOKEN
// ============================================================

// ============================================================
// TELEGRAM LOGIN И СЕССИИ АДМИНИСТРАТОРА
// ============================================================

// Проверка Telegram Login Widget: подпись проверяется только на сервере.
function telegramAuthHex(bytes) {
  return bytes.map(function(byte) { return ((byte + 256) % 256).toString(16).padStart(2, "0"); }).join("");
}

function telegramAuthEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function isAllowedTelegramAdminId(id) {
  const properties = PropertiesService.getScriptProperties();
  return [ADMIN_TELEGRAM_USER_ID_PROPERTY, MASTER_TELEGRAM_USER_ID_PROPERTY].some(function(key) {
    const allowed = String(properties.getProperty(key) || "").trim();
    return allowed && allowed === String(id);
  });
}

function getTelegramLoginConfig() {
  const cache = CacheService.getScriptCache();
  let username = cache.get("ADMIN_LOGIN_BOT_USERNAME");
  if (!username) {
    const bot = telegramApiCall("getMe", {});
    username = String(bot.username || "");
    if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) throw new Error("Не удалось определить имя бота");
    cache.put("ADMIN_LOGIN_BOT_USERNAME", username, 300);
  }
  return { success: true, botUsername: username };
}

function telegramSessionKey(token) {
  return "ADMIN_SESSION_" + telegramAuthHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8));
}

function loginTelegramAdmin(auth) {
  const denied = { success: false, error: "Вход не подтверждён. Используйте Telegram-аккаунт администратора или мастера." };
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) return denied;
  const fields = ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"];
  const keys = Object.keys(auth);
  if (keys.some(function(key) { return fields.indexOf(key) === -1 || !["string", "number"].includes(typeof auth[key]); })) return denied;
  if (!/^\d{1,20}$/.test(String(auth.id || "")) || !/^[a-f0-9]{64}$/.test(String(auth.hash || ""))) return denied;
  const now = Math.floor(Date.now() / 1000);
  const authDate = Number(auth.auth_date);
  if (!Number.isInteger(authDate) || authDate > now + 30 || now - authDate > 300) return denied;
  if (!isAllowedTelegramAdminId(auth.id)) return denied;
  const token = PropertiesService.getScriptProperties().getProperty(TELEGRAM_BOT_TOKEN_PROPERTY);
  if (!token) return denied;
  const checkString = keys.filter(function(key) { return key !== "hash"; }).sort().map(function(key) {
    return key + "=" + String(auth[key]);
  }).join("\n");
  if (checkString.length > 4096) return denied;
  const secret = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8);
  const expected = telegramAuthHex(Utilities.computeHmacSha256Signature(Utilities.newBlob(checkString).getBytes(), secret));
  if (!telegramAuthEqual(expected, auth.hash)) return denied;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const usedKey = "ADMIN_LOGIN_USED_" + auth.hash;
    if (cache.get(usedKey)) return { success: false, error: "Этот вход уже использован. Войдите через Telegram ещё раз." };
    const sessionToken = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    const expiresAt = Date.now() + 6 * 60 * 60 * 1000;
    cache.put(telegramSessionKey(sessionToken), JSON.stringify({ id: String(auth.id), expiresAt: expiresAt }), 21600);
    cache.put(usedKey, "1", 360);
    return { success: true, sessionToken: sessionToken, expiresAt: expiresAt };
  } finally {
    lock.releaseLock();
  }
}

function checkTelegramAdminAccess(sessionToken) {
  if (typeof sessionToken !== "string" || !/^[a-f0-9]{64}$/.test(sessionToken)) return false;
  try {
    const raw = CacheService.getScriptCache().get(telegramSessionKey(sessionToken));
    if (!raw) return false;
    const session = JSON.parse(raw);
    return Number(session.expiresAt) > Date.now() && isAllowedTelegramAdminId(session.id);
  } catch (error) {
    return false;
  }
}

function logoutTelegramAdmin(sessionToken) {
  if (typeof sessionToken === "string" && /^[a-f0-9]{64}$/.test(sessionToken)) {
    CacheService.getScriptCache().remove(telegramSessionKey(sessionToken));
  }
  return { success: true };
}


// ============================================================
// ЕЖЕДНЕВНАЯ СВОДКА ЗАПИСЕЙ
// ============================================================

function sendDailyBookingsSummary() {
  const timezone = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
  const bookings = getBookings(getSheet())
    .filter(function(booking) {
      return booking.date === today && booking.status === "Активна";
    })
    .sort(function(a, b) {
      return String(a.time || "").localeCompare(String(b.time || ""));
    });

  // Не отправляем пустую сводку.
  if (!bookings.length) return;

  const token = PropertiesService.getScriptProperties()
    .getProperty(TELEGRAM_BOT_TOKEN_PROPERTY);
  const recipientIds = Array.from(new Set([
    PropertiesService.getScriptProperties().getProperty(ADMIN_TELEGRAM_USER_ID_PROPERTY),
    PropertiesService.getScriptProperties().getProperty(MASTER_TELEGRAM_USER_ID_PROPERTY)
  ].filter(Boolean)));

  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не найден");
  if (!recipientIds.length) throw new Error("Не заданы получатели сводки Telegram");

  const lines = bookings.map(function(booking) {
    return escapeTelegram(booking.time || "—") + " — " + escapeTelegram(booking.service || "Процедура не указана");
  });
  const message = "☀️ <b>Записи на сегодня: " + bookings.length + "</b>\n\n" + lines.join("\n");
  const url = "https://api.telegram.org/bot" + token + "/sendMessage";

  recipientIds.forEach(function(chatId) {
    telegramApiCall("sendMessage", { chat_id: chatId, text: message, parse_mode: "HTML" });
  });
}

/** Запустить один раз вручную, чтобы создать ежедневный триггер на 8:00. */
function installDailyBookingsSummaryTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "sendDailyBookingsSummary") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("sendDailyBookingsSummary")
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(0)
    .inTimezone(Session.getScriptTimeZone())
    .create();
}

// ============================================================
// TELEGRAM: сообщения с кнопками подтверждения и отмены
// ============================================================

function formatBookingTelegramMessage(booking, outcome) {
  const heading = outcome === "confirm"
    ? "✅ <b>Заказ подтвержден</b>\n\n"
    : outcome === "move"
      ? "📅 <b>Запись перенесена</b>\n\n"
    : outcome === "cancel"
      ? "❌ <b>Заказ отменен</b>\n\n"
      : "🔔 <b>НОВАЯ ЗАПИСЬ</b>\n\n";

  return heading +
    "👤 <b>Имя:</b> " + escapeTelegram(booking.name) + "\n" +
    "📞 <b>Телефон:</b> " + escapeTelegram(booking.phone) + "\n" +
    "💬 <b>Telegram:</b> " + escapeTelegram(booking.telegram || "—") + "\n" +
    "💅 <b>Услуга:</b> " + escapeTelegram(booking.service) + "\n" +
    "📅 <b>Дата:</b> " + escapeTelegram(booking.date) + "\n" +
    "🕐 <b>Время:</b> " + escapeTelegram(booking.time) + "\n" +
    "📝 <b>Комментарий:</b> " + escapeTelegram(booking.comment || "—");
}

function telegramApiCall(method, payload, allowMasterReply) {
  // Администратор продолжает получать сообщения, даже если оба ID совпадают.
  if (!MASTER_TELEGRAM_NOTIFICATIONS_ENABLED && !allowMasterReply && payload && payload.chat_id != null) {
    const properties = PropertiesService.getScriptProperties();
    const masterId = String(properties.getProperty(MASTER_TELEGRAM_USER_ID_PROPERTY) || "");
    const adminId = String(properties.getProperty(ADMIN_TELEGRAM_USER_ID_PROPERTY) || "");
    if (masterId && masterId !== adminId && String(payload.chat_id) === masterId) {
      return null;
    }
  }
  const token = PropertiesService.getScriptProperties().getProperty(TELEGRAM_BOT_TOKEN_PROPERTY);
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не найден");

  const response = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const raw = response.getContentText();
  let result;
  try { result = JSON.parse(raw); } catch (error) {
    throw new Error("Telegram вернул некорректный ответ: " + raw);
  }
  if (!result.ok) throw new Error("Telegram error: " + raw);
  return result.result;
}

function sendNewBookingTelegram(booking) {
  if (!booking) throw new Error("Нет данных записи");

  const properties = PropertiesService.getScriptProperties();
  const adminChatId = properties.getProperty(ADMIN_TELEGRAM_USER_ID_PROPERTY);
  const masterChatId = properties.getProperty(MASTER_TELEGRAM_USER_ID_PROPERTY);
  if (!adminChatId && !masterChatId) throw new Error("Не заданы получатели уведомлений Telegram");

  const keyboard = {
    inline_keyboard: [[
      { text: "Отменить", callback_data: "booking_cancel:" + booking.id },
      { text: "Подтвердить", callback_data: "booking_confirm:" + booking.id }
    ]]
  };
  const message = formatBookingTelegramMessage(booking, "pending");
  const targets = [
    { chatId: adminChatId, column: 11 },
    { chatId: masterChatId, column: 12 }
  ];
  const failures = [];
  targets.forEach(function(target) {
    if (!target.chatId) return;
    try {
      const sent = telegramApiCall("sendMessage", {
        chat_id: target.chatId,
        text: message,
        parse_mode: "HTML",
        reply_markup: keyboard
      });
      if (booking.rowNumber && sent && sent.message_id) {
        getSheet().getRange(booking.rowNumber, target.column).setValue(String(sent.message_id));
      }
    } catch (error) {
      // Failure for one recipient must not prevent delivery to the other.
      failures.push("column " + target.column + ": " + error.message);
    }
  });
  if (failures.length) throw new Error(failures.join("; "));

}

function handleTelegramBookingCallback(callback, event) {
  try {
    return processTelegramBookingCallback(callback, event);
  } catch (error) {
    console.error("Ошибка обработки кнопки записи: " + error.message);
    answerTelegramCallback(callback.id, "Не удалось обработать запись. Проверьте её статус в админ-панели и повторите попытку.", true);
    return { success: false, error: "Booking callback failed" };
  }
}

function processTelegramBookingCallback(callback, event) {
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty(TELEGRAM_WEBHOOK_SECRET_PROPERTY);
  const suppliedSecret = event && event.parameter ? event.parameter.telegramSecret : "";
  if (!secret || suppliedSecret !== secret) {
    answerTelegramCallback(callback.id, "Запрос не прошел проверку доступа.", true);
    return { success: false, error: "Webhook access denied" };
  }

  const recipients = [
    String(properties.getProperty(ADMIN_TELEGRAM_USER_ID_PROPERTY) || ""),
    String(properties.getProperty(MASTER_TELEGRAM_USER_ID_PROPERTY) || "")
  ].filter(Boolean);
  const senderId = String(callback.from && callback.from.id || "");
  const chatId = String(callback.message && callback.message.chat && callback.message.chat.id || "");
  if (!recipients.includes(senderId) || !recipients.includes(chatId)) {
    answerTelegramCallback(callback.id, "У вас нет доступа к этому действию.", true);
    return { success: false, error: "Telegram user is not authorized" };
  }

  const match = String(callback.data || "").match(/^booking_(confirm|cancel):([\w-]{1,64})$/);
  if (!match) {
    answerTelegramCallback(callback.id, "Неизвестное действие.", true);
    return { success: false, error: "Invalid callback data" };
  }

  const outcome = match[1];
  const bookingId = match[2];
  if (outcome === "cancel") {
    answerTelegramCallback(callback.id, "Подтвердите отмену");
    requestStaffCancellation(chatId, bookingId);
    return {success:true};
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let booking;
  let applied = false;
  try {
    booking = findBookingById(bookingId);
    if (!booking) {
      answerTelegramCallback(callback.id, "Заказ не найден.", true);
      return { success: false, error: "Booking not found" };
    }
    if (booking.status === "Ожидает подтверждения") {
      booking.status = outcome === "confirm" ? "Активна" : "Отменена";
      getSheet().getRange(booking.rowNumber, 9).setValue(booking.status);
      applied = true;
    }
  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }

  const finalOutcome = booking.status === "Отменена" ? "cancel" : "confirm";
  // Answer the button immediately after saving, before other Telegram requests.
  answerTelegramCallback(callback.id, applied
    ? (finalOutcome === "cancel" ? "Заказ отменен" : "Заказ подтвержден")
    : "Заказ уже обработан");
  editTelegramBookingMessages(booking, callback.message, finalOutcome);
  if (applied) sendClientBookingStatus(booking, finalOutcome);
  return { success: true, applied: applied, status: booking.status };
}

function editTelegramBookingMessages(booking, pressedMessage, outcome) {
  const properties = PropertiesService.getScriptProperties();
  const chats = [
    { chatId: String(properties.getProperty(ADMIN_TELEGRAM_USER_ID_PROPERTY) || ""), messageId: booking.adminTelegramMessageId },
    { chatId: String(properties.getProperty(MASTER_TELEGRAM_USER_ID_PROPERTY) || ""), messageId: booking.masterTelegramMessageId }
  ];
  const pressedChatId = String(pressedMessage && pressedMessage.chat && pressedMessage.chat.id || "");
  const pressedMessageId = String(pressedMessage && pressedMessage.message_id || "");
  if (!chats.some(function(item) { return item.chatId === pressedChatId && String(item.messageId) === pressedMessageId; })) {
    chats.push({ chatId: pressedChatId, messageId: pressedMessageId });
  }

  chats.forEach(function(item) {
    if (!item.chatId || !item.messageId) return;
    try {
      telegramApiCall("editMessageText", {
        chat_id: item.chatId,
        message_id: Number(item.messageId),
        text: formatBookingTelegramMessage(booking, outcome),
        parse_mode: "HTML",
        reply_markup: staffBookingButtons(booking)
      }, item.chatId === pressedChatId && String(item.messageId) === pressedMessageId);
    } catch (error) {
      console.error("Не удалось обновить сообщение Telegram: " + error.message);
    }
  });
}

function answerTelegramCallback(callbackId, text, showAlert) {
  if (!callbackId) return;
  try {
    telegramApiCall("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: text || "",
      show_alert: Boolean(showAlert)
    });
  } catch (error) {
    console.error("Не удалось ответить на нажатие Telegram: " + error.message);
  }
}

// Run once in the Apps Script editor after deploying the web app.
function installTelegramBookingWebhook() {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty(TELEGRAM_BOT_TOKEN_PROPERTY);
  const deploymentUrl = WEB_APP_URL;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не найден");
  if (!deploymentUrl) throw new Error("Сначала разверните проект как веб-приложение");

  let secret = properties.getProperty(TELEGRAM_WEBHOOK_SECRET_PROPERTY);
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    properties.setProperty(TELEGRAM_WEBHOOK_SECRET_PROPERTY, secret);
  }
  const webhookUrl = deploymentUrl + "?telegramSecret=" + encodeURIComponent(secret);
  telegramApiCall("setWebhook", { url: webhookUrl, allowed_updates: ["callback_query", "message"] });
  installClientBookingRemindersTrigger();
  configureClientBotProfile();
  return { success: true, message: "Webhook, профиль бота и напоминания для клиентов установлены." };
}

// Запустите вручную: проверка доставки кнопок без отправки сообщений.
// URL webhook содержит секрет и намеренно не выводится в журнал.
function diagnoseTelegramBookingWebhook() {
  const info = telegramApiCall("getWebhookInfo", {});
  const properties = PropertiesService.getScriptProperties();
  const deploymentUrl = WEB_APP_URL;
  const secret = properties.getProperty(TELEGRAM_WEBHOOK_SECRET_PROPERTY);
  const expectedUrl = deploymentUrl && secret
    ? deploymentUrl + "?telegramSecret=" + encodeURIComponent(secret) : "";
  // Telegram's delivery error is needed to distinguish access and server failures.
  // Redact URLs and credentials before writing it to the execution log.
  let deliveryError = String(info.last_error_message || "");
  [secret, properties.getProperty(TELEGRAM_BOT_TOKEN_PROPERTY)].filter(Boolean).forEach(function(value) {
    deliveryError = deliveryError.split(String(value)).join("[скрыто]");
  });
  deliveryError = deliveryError.replace(/https?:\/\/[^\s]+/gi, "[URL скрыт]");
  const report = {
    webhookConfigured: Boolean(info.url),
    webhookMatchesCurrentDeployment: Boolean(expectedUrl && info.url === expectedUrl),
    callbacksEnabled: !info.allowed_updates || info.allowed_updates.length === 0 || info.allowed_updates.includes("callback_query"),
    messagesEnabled: !info.allowed_updates || info.allowed_updates.length === 0 || info.allowed_updates.includes("message"),
    pendingUpdateCount: info.pending_update_count || 0,
    lastDeliveryErrorAt: info.last_error_date || null,
    hasDeliveryError: Boolean(info.last_error_message),
    lastDeliveryError: deliveryError || null,
    adminConfigured: Boolean(properties.getProperty(ADMIN_TELEGRAM_USER_ID_PROPERTY)),
    masterNotificationsEnabled: MASTER_TELEGRAM_NOTIFICATIONS_ENABLED
  };
  console.log(JSON.stringify(report));
  return report;
}

// Проверяет анонимный POST именно на зарегистрированный адрес webhook.
// Не создаёт записи и не отправляет сообщения; URL и тела ответов не журналируются.
function diagnoseTelegramWebhookPost() {
  const info = telegramApiCall("getWebhookInfo", {});
  if (!/^https:\/\/script\.google\.com\//.test(String(info.url || ""))) {
    throw new Error("Webhook не указывает на script.google.com");
  }
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ action: "diagnoseWebhookTransport" }),
    muteHttpExceptions: true,
    followRedirects: false
  };
  const first = UrlFetchApp.fetch(info.url, options);
  const headers = first.getAllHeaders();
  const locationKey = Object.keys(headers).find(function(key) { return key.toLowerCase() === "location"; });
  const location = locationKey ? String(headers[locationKey]) : "";
  const report = {
    firstHttpStatus: first.getResponseCode(),
    redirectHost: (location.match(/^https:\/\/([^/]+)/i) || [])[1] || null,
    finalHttpStatus: first.getResponseCode(),
    reachedDoPost: false
  };
  const finalResponse = location
    ? UrlFetchApp.fetch(info.url, Object.assign({}, options, { followRedirects: true }))
    : first;
  report.finalHttpStatus = finalResponse.getResponseCode();
  try {
    const body = finalResponse.getContentText();
    // Distinguish an old deployed JSON handler from the new HTML acknowledgement.
    report.responseKind = /\bOK\b/.test(body) ? "html_acknowledgement" : "unrecognized";
    report.reachedDoPost = report.finalHttpStatus === 200 && report.responseKind === "html_acknowledgement";
    try {
      const result = JSON.parse(body);
      if (result.success === false && result.error === "Неизвестная команда") {
        report.responseKind = "old_deployment_json";
        report.reachedDoPost = true;
      } else {
        report.responseKind = "json_response";
      }
    } catch (parseError) {
      // HTML response: keep the classification above without exposing its contents.
    }
  } catch (error) {
    // HTML access errors are not logged: they may contain private URLs.
  }
  console.log(JSON.stringify(report));
  return report;
}

// ============================================================
// TELEGRAM: КЛИЕНТСКАЯ ЗАПИСЬ
// ============================================================

const CLIENT_BOT_SERVICES = ["Маникюр", "Педикюр", "Депиляция"];
const CLIENT_BOT_STATE_PREFIX = "CLIENT_BOT_STATE_";
const BOOKING_CLIENT_CHAT_PREFIX = "BOOKING_CLIENT_CHAT_";
const BOOKING_REMINDER_PREFIX = "BOOKING_REMINDER_";

function checkTelegramWebhookAccess(event) {
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty(TELEGRAM_WEBHOOK_SECRET_PROPERTY);
  const suppliedSecret = event && event.parameter ? event.parameter.telegramSecret : "";
  return Boolean(secret && secret === suppliedSecret);
}

function clientBotStateKey(chatId) {
  return CLIENT_BOT_STATE_PREFIX + String(chatId);
}

function getClientBotState(chatId) {
  const raw = PropertiesService.getScriptProperties().getProperty(clientBotStateKey(chatId));
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (error) { return {}; }
}

function setClientBotState(chatId, state) {
  PropertiesService.getScriptProperties().setProperty(clientBotStateKey(chatId), JSON.stringify(state));
}

function clearClientBotState(chatId) {
  PropertiesService.getScriptProperties().deleteProperty(clientBotStateKey(chatId));
}

function sendClientBotMessage(chatId, text, options) {
  const payload = {
    chat_id: String(chatId),
    text: text,
    parse_mode: "HTML"
  };
  if (options && options.reply_markup) payload.reply_markup = options.reply_markup;
  return telegramApiCall("sendMessage", payload);
}

function dispatchTelegramMessage(message, event) {
  if (!checkTelegramWebhookAccess(event)) return { success: false, error: "Webhook access denied" };
  if (!message.chat || message.chat.type !== "private") return { success: true };
  try {
    return isTelegramStaff(message.from, message.chat)
      ? handleStaffTelegramMessage(message, event)
      : handleClientTelegramMessage(message, event);
  } catch (error) {
    console.error("Telegram menu handler failed: " + error.message);
    try {
      telegramApiCall("sendMessage", {
        chat_id: String(message.chat.id),
        text: "Не удалось выполнить команду. Попробуйте ещё раз. Если ошибка повторится, сообщите администратору."
      }, true);
    } catch (replyError) {
      console.error("Telegram menu error reply failed: " + replyError.message);
    }
    return { success: false, error: "Telegram menu handler failed" };
  }
}

// Рабочее меню доступно только разрешённым пользователям в личном чате.
function isTelegramStaff(user, chat) {
  if (!user || !chat || chat.type !== "private" || String(user.id) !== String(chat.id)) return false;
  const properties = PropertiesService.getScriptProperties();
  return [ADMIN_TELEGRAM_USER_ID_PROPERTY, MASTER_TELEGRAM_USER_ID_PROPERTY].some(function(key) {
    const id = properties.getProperty(key);
    return Boolean(id) && String(id) === String(user.id);
  });
}

function sendStaffTelegramMessage(chatId, text, markup) {
  // Ответ на запрос мастера разрешён даже при отключённых автоуведомлениях.
  return telegramApiCall("sendMessage", {
    chat_id: String(chatId), text: text, parse_mode: "HTML",
    reply_markup: markup || {
      keyboard: [["📅 Сегодня", "📅 Завтра"], ["🗓 Выбрать дату"], ["⏳ Ожидают подтверждения"], ["🕐 Свободные окна"]],
      resize_keyboard: true
    }
  }, true);
}

function staffBotMenu(chatId) {
  clearClientBotState(chatId);
  refreshTelegramChatCommands(chatId);
  return sendStaffTelegramMessage(chatId, "<b>Рабочее меню</b>\nВыберите записи для просмотра или свободные окна.");
}

function handleStaffTelegramMessage(message, event) {
  if (!checkTelegramWebhookAccess(event) || !isTelegramStaff(message.from, message.chat)) {
    return { success: false, error: "Access denied" };
  }
  const chatId = String(message.chat.id);
  const text = String(message.text || "").trim();
  const actions = { "📅 Сегодня": "today", "/today": "today", "📅 Завтра": "tomorrow", "/tomorrow": "tomorrow", "⏳ Ожидают подтверждения": "pending", "/pending": "pending" };
  if (actions[text]) {
    sendStaffBookings(chatId, actions[text], 0);
  } else if (text === "🗓 Выбрать дату") {
    sendStaffCalendar(chatId, getDateAfterDays(0).slice(0, 7));
  } else if (text === "🕐 Свободные окна" || text === "/slots") {
    const slots = getNearestAvailability(getSheet()).slots;
    sendStaffTelegramMessage(chatId, slots.length
      ? "<b>Свободные окна</b>\n\n" + slots.map(function(slot) {
          return escapeTelegram(formatDateForTelegram(slot.date) + " — " + slot.time);
        }).join("\n")
      : "Свободных окон в периоде записи нет.");
  } else {
    staffBotMenu(chatId);
  }
  return { success: true };
}

// Календарь и действия сотрудников. Одноразовые кнопки привязаны к чату на 30 минут.
function staffDateLabel(date) { return String(date).split("-").reverse().join("."); }
function staffDateShift(date, days) {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function staffBookingRevision(booking) {
  return JSON.stringify([booking.date, booking.time, booking.status]);
}
function staffActionState(chatId, token) {
  if (!/^[a-f0-9]{16}$/.test(token)) return null;
  const raw = CacheService.getScriptCache().get("STAFF_ACTION_" + token);
  if (!raw) return null;
  const state = JSON.parse(raw);
  return state.chatId === String(chatId) && state.expiresAt > Date.now() ? state : null;
}
function saveStaffAction(token, state) {
  CacheService.getScriptCache().put("STAFF_ACTION_" + token, JSON.stringify(state), 1800);
}
function startStaffAction(chatId, id, kind) {
  const booking = findBookingById(id);
  if (!booking || !["Активна", "Ожидает подтверждения"].includes(booking.status)) {
    sendStaffTelegramMessage(chatId, "Запись не найдена или уже отменена. Обновите список.");
    return null;
  }
  const token = Utilities.getUuid().replace(/-/g, "").slice(0, 16);
  const state = { chatId: String(chatId), id: id, kind: kind, revision: staffBookingRevision(booking), expiresAt: Date.now() + 1800000 };
  saveStaffAction(token, state);
  return { token: token, booking: booking };
}
function staffBookingButtons(booking) {
  if (!["Активна", "Ожидает подтверждения"].includes(booking.status)) return { inline_keyboard: [] };
  const rows = [];
  if (booking.status === "Ожидает подтверждения") rows.push([{ text: "Подтвердить", callback_data: "booking_confirm:" + booking.id }]);
  rows.push([
    { text: "Перенести", callback_data: "admin_move:" + booking.id },
    { text: "Отменить запись", callback_data: "admin_cancel:" + booking.id }
  ]);
  return { inline_keyboard: rows };
}
function sendStaffCalendar(chatId, month, token) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !isValidBookingDate(month + "-01")) throw new Error("Некорректный месяц");
  const first = month + "-01";
  const next = new Date(first + "T00:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 7);
  const previous = new Date(first + "T00:00:00Z");
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const prevMonth = previous.toISOString().slice(0, 7);
  const calendarPrefix = token ? "admin_mc:" + token + ":" : "admin_cal:";
  const rows = [[{ text: "‹", callback_data: calendarPrefix + prevMonth },
    { text: month.split("-").reverse().join("."), callback_data: "admin_noop" },
    { text: "›", callback_data: calendarPrefix + nextMonth }]];
  rows.push(["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(function(day) { return { text: day, callback_data: "admin_noop" }; }));
  let week = Array.from({length: (new Date(first + "T00:00:00Z").getUTCDay() + 6) % 7}, function() { return {text:"·",callback_data:"admin_noop"}; });
  const state = token ? staffActionState(chatId, token) : null;
  if (token && (!state || state.kind !== "move")) return sendStaffTelegramMessage(chatId, "Кнопка устарела. Откройте запись заново.");
  const bookings = token ? getBookings(getSheet()) : [];
  for (let date = first; date < nextMonth + "-01"; date = staffDateShift(date, 1)) {
    const available = !token || staffFreeTimes(date, state.id, bookings).length > 0;
    week.push({ text: available ? String(Number(date.slice(8))) : "·", callback_data: available
      ? (token ? "admin_md:" + token + ":" + date : "admin_date:" + date + ":0") : "admin_noop" });
    if (week.length === 7) { rows.push(week); week = []; }
  }
  if (week.length) rows.push(week);
  rows.push([{ text:"Главное меню", callback_data:"admin_home" }]);
  sendStaffTelegramMessage(chatId, token ? "Выберите новую дату. Дни без свободного времени отмечены точкой." : "Выберите дату для просмотра записей:", {inline_keyboard:rows});
}
function staffFreeTimes(date, excludeId, bookings) {
  if (!isValidBookingDate(date) || !isBookingDateAllowed(date) || isClosedDay(date)) return [];
  return getScheduleTimes(date).filter(function(time) {
    return !isPastBookingTime(date, time) && !bookings.some(function(booking) {
      return booking.id !== excludeId && booking.status !== "Отменена" && booking.date === date && booking.time === time;
    });
  });
}
function requestStaffCancellation(chatId, id) {
  const action = startStaffAction(chatId, id, "cancel");
  if (!action) return;
  sendStaffTelegramMessage(chatId, "<b>Отменить запись?</b>\n" + escapeTelegram(String(action.booking.name).slice(0,100)) +
    "\n" + staffDateLabel(action.booking.date) + " в " + escapeTelegram(action.booking.time), {inline_keyboard:[
      [{text:"Да, отменить запись", callback_data:"admin_cok:" + action.token}],
      [{text:"Нет, оставить запись", callback_data:"admin_abort:" + action.token}]
    ]});
}
function applyStaffAction(chatId, token, kind) {
  return withBookingLock(function() {
    const state = staffActionState(chatId, token);
    if (!state || state.kind !== kind) return {success:false, error:"Действие уже выполнено или кнопка устарела. Обновите список."};
    const booking = findBookingById(state.id);
    if (!booking || staffBookingRevision(booking) !== state.revision) return {success:false, error:"Запись уже изменена. Откройте её заново."};
    const previous = {date:booking.date, time:booking.time};
    if (kind === "move") {
      if (!state.date || !state.time || !staffFreeTimes(state.date, booking.id, getBookings(getSheet())).includes(state.time)) {
        return {success:false, error:"Время уже занято или недоступно. Выберите новое время."};
      }
      if (booking.date === state.date && booking.time === state.time) return {success:false, error:"Выбрано текущее время записи."};
      getSheet().getRange(booking.rowNumber, 6, 1, 2).setValues([[state.date, state.time]]);
      booking.date = state.date; booking.time = state.time;
      PropertiesService.getScriptProperties().deleteProperty(BOOKING_REMINDER_PREFIX + booking.id);
    } else {
      getSheet().getRange(booking.rowNumber, 9).setValue("Отменена");
      booking.status = "Отменена";
    }
    CacheService.getScriptCache().remove("STAFF_ACTION_" + token);
    return {success:true, booking:booking, previous:previous};
  });
}
function finishStaffAction(callback, token, kind) {
  const chatId = String(callback.message.chat.id);
  const result = applyStaffAction(chatId, token, kind);
  if (!result.success) { answerTelegramCallback(callback.id, result.error, true); return result; }
  answerTelegramCallback(callback.id, kind === "move" ? "Запись перенесена" : "Запись отменена");
  editTelegramBookingMessages(result.booking, callback.message, kind === "move" ? "move" : "cancel");
  if (kind === "cancel") sendClientBookingStatus(result.booking, "cancel");
  else {
    const clientChat = PropertiesService.getScriptProperties().getProperty(BOOKING_CLIENT_CHAT_PREFIX + result.booking.id);
    if (clientChat) {
      try {
        sendClientBotMessage(clientChat, "📅 <b>Ваша запись перенесена</b>\n💅 " + escapeTelegram(result.booking.service) +
          "\nБыло: " + staffDateLabel(result.previous.date) + " в " + escapeTelegram(result.previous.time) +
          "\nСтало: " + staffDateLabel(result.booking.date) + " в " + escapeTelegram(result.booking.time) +
          "\nСтатус: " + escapeTelegram(result.booking.status));
      } catch (error) { console.error("Не удалось уведомить клиента о переносе: " + error.message); }
    }
  }
  return result;
}


function handleStaffTelegramCallback(callback, event) {
  if (!checkTelegramWebhookAccess(event) || !isTelegramStaff(callback.from, callback.message && callback.message.chat)) {
    answerTelegramCallback(callback.id, "Доступ запрещён", true);
    return {success:false, error:"Access denied"};
  }
  try {
    return processStaffTelegramCallback(callback);
  } catch (error) {
    console.error("Ошибка рабочего меню: " + error.message);
    answerTelegramCallback(callback.id, "Не удалось выполнить действие. Обновите список и повторите попытку.", true);
    return {success:false, error:"Staff action failed"};
  }
}
function cloneStaffAction(state, patch) {
  const token = Utilities.getUuid().replace(/-/g, "").slice(0,16);
  saveStaffAction(token, Object.assign({}, state, patch));
  return token;
}
function processStaffTelegramCallback(callback) {
  const chatId = String(callback.message.chat.id);
  const data = String(callback.data || "");
  let match;
  if (data === "admin_noop") { answerTelegramCallback(callback.id, "Выберите доступную дату"); return {success:true}; }
  if (data === "admin_home") { answerTelegramCallback(callback.id, "Главное меню"); staffBotMenu(chatId); return {success:true}; }
  if ((match = data.match(/^admin_list:(today|tomorrow|pending):(\d{1,6})$/))) {
    answerTelegramCallback(callback.id, "Загружаю записи…");
    sendStaffBookings(chatId, match[1], Number(match[2]));
    return {success:true};
  }
  if ((match = data.match(/^admin_date:(\d{4}-\d{2}-\d{2}):(\d{1,6})$/)) && isValidBookingDate(match[1])) {
    answerTelegramCallback(callback.id, "Загружаю записи…");
    sendStaffBookings(chatId, match[1], Number(match[2]));
    return {success:true};
  }
  if ((match = data.match(/^admin_cal:(\d{4}-\d{2})$/))) {
    answerTelegramCallback(callback.id, "Календарь");
    sendStaffCalendar(chatId, match[1]);
    return {success:true};
  }
  if ((match = data.match(/^admin_(move|cancel):([\w-]{1,40})$/))) {
    answerTelegramCallback(callback.id, match[1] === "move" ? "Выберите новую дату" : "Подтвердите отмену");
    if (match[1] === "cancel") requestStaffCancellation(chatId, match[2]);
    else {
      const action = startStaffAction(chatId, match[2], "move");
      if (action) sendStaffCalendar(chatId, getDateAfterDays(0).slice(0,7), action.token);
    }
    return {success:true};
  }
  if ((match = data.match(/^admin_(cok|mok):([a-f0-9]{16})$/))) {
    return finishStaffAction(callback, match[2], match[1] === "cok" ? "cancel" : "move");
  }
  if ((match = data.match(/^admin_abort:([a-f0-9]{16})$/))) {
    const stopped = withBookingLock(function() {
      if (!staffActionState(chatId, match[1])) return false;
      CacheService.getScriptCache().remove("STAFF_ACTION_" + match[1]);
      return true;
    });
    answerTelegramCallback(callback.id, stopped ? "Действие отменено" : "Действие уже обработано или кнопка устарела");
    if (stopped) sendStaffTelegramMessage(chatId, "Действие отменено. Эта кнопка больше не изменит запись.");
    return {success:stopped};
  }
  if ((match = data.match(/^admin_(mc|md|mt):([a-f0-9]{16}):([\d-]+)$/))) {
    const state = staffActionState(chatId, match[2]);
    if (!state || state.kind !== "move") {
      answerTelegramCallback(callback.id, "Кнопка устарела. Откройте запись заново.", true);
      return {success:false};
    }
    if (match[1] === "mc") {
      answerTelegramCallback(callback.id, "Календарь");
      sendStaffCalendar(chatId, match[3], match[2]);
    } else if (match[1] === "md") {
      const date = match[3];
      const times = staffFreeTimes(date, state.id, getBookings(getSheet()));
      if (!times.length) { answerTelegramCallback(callback.id, "На эту дату нет свободного времени", true); return {success:false}; }
      const dateToken = cloneStaffAction(state, {date:date});
      answerTelegramCallback(callback.id, "Выберите время");
      const rows = times.map(function(time) { return [{text:time, callback_data:"admin_mt:" + dateToken + ":" + time.replace(":", "")}]; });
      rows.push([{text:"Назад к датам",callback_data:"admin_mc:" + match[2] + ":" + date.slice(0,7)}]);
      sendStaffTelegramMessage(chatId, "Свободное время на " + staffDateLabel(date) + ":", {inline_keyboard:rows});
    } else {
      if (!/^\d{4}$/.test(match[3]) || !state.date) throw new Error("Invalid time selection");
      const time = match[3].slice(0,2) + ":" + match[3].slice(2);
      if (!staffFreeTimes(state.date, state.id, getBookings(getSheet())).includes(time)) {
        answerTelegramCallback(callback.id, "Время уже занято. Выберите другое.", true); return {success:false};
      }
      const confirmationToken = cloneStaffAction(state, {time:time});
      answerTelegramCallback(callback.id, "Подтвердите перенос");
      const original = JSON.parse(state.revision);
      const booking = findBookingById(state.id);
      sendStaffTelegramMessage(chatId, "<b>Перенести запись?</b>\n" + escapeTelegram(String(booking && booking.name || "Клиент").slice(0, 100)) +
        "\nБыло: " + staffDateLabel(original[0]) + " в " + escapeTelegram(original[1]) +
        "\nСтало: " + staffDateLabel(state.date) + " в " + time, {inline_keyboard:[
        [{text:"Да, перенести", callback_data:"admin_mok:" + confirmationToken}],
        [{text:"Нет, оставить запись",callback_data:"admin_abort:" + confirmationToken}]
      ]});
    }
    return {success:true};
  }
  answerTelegramCallback(callback.id, "Кнопка устарела. Откройте меню заново.", true);
  return {success:false, error:"Invalid callback data"};
}

function sendStaffBookings(chatId, mode, offset) {
  const today = getDateAfterDays(0);
  const targetDate = isValidBookingDate(mode) ? mode : mode === "tomorrow" ? getDateAfterDays(1) : today;
  const bookings = getBookings(getSheet()).filter(function(booking) {
    if (booking.status === "Отменена") return false;
    return mode === "pending"
      ? booking.status === "Ожидает подтверждения" && booking.date >= today
      : booking.date === targetDate;
  }).sort(function(a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  const titles = { today: "Записи на сегодня", tomorrow: "Записи на завтра", pending: "Ожидают подтверждения" };
  const page = bookings.slice(offset, offset + 5);
  sendStaffTelegramMessage(chatId, "<b>" + (titles[mode] || "Записи на " + staffDateLabel(targetDate)) + "</b> — " + bookings.length +
    (page.length ? "\nПоказаны " + (offset + 1) + "–" + (offset + page.length) : "\nЗаписей нет."));
  page.forEach(function(booking) {
    // Ограничиваем поля карточки, чтобы длинный комментарий не сорвал весь список.
    const text = "📅 " + escapeTelegram(booking.date + " " + booking.time) +
      "\n👤 " + escapeTelegram(String(booking.name).slice(0, 100)) +
      "\n📞 " + escapeTelegram(String(booking.phone).slice(0, 50)) +
      "\n💅 " + escapeTelegram(String(booking.service).slice(0, 150)) +
      "\nСтатус: " + escapeTelegram(booking.status);
    const markup = staffBookingButtons(booking);
    sendStaffTelegramMessage(chatId, text, markup);
  });
  if (offset + page.length < bookings.length) {
    sendStaffTelegramMessage(chatId, "Продолжить просмотр:", { inline_keyboard: [[{
      text: "Следующие записи →", callback_data: (isValidBookingDate(mode) ? "admin_date:" : "admin_list:") + mode + ":" + (offset + 5)
    }]] });
  }
  if (mode !== "pending") sendStaffTelegramMessage(chatId, "Выбрать другой день:", {inline_keyboard:[[
    {text:"‹ Предыдущий день", callback_data:"admin_date:" + staffDateShift(targetDate, -1) + ":0"},
    {text:"Следующий день ›", callback_data:"admin_date:" + staffDateShift(targetDate, 1) + ":0"}
  ], [{text:"Календарь", callback_data:"admin_cal:" + targetDate.slice(0,7)}, {text:"Главное меню",callback_data:"admin_home"}]]});

}

function clientBotMenu(chatId, text) {
  refreshTelegramChatCommands(chatId);
  return sendClientBotMessage(chatId, text || "Выберите действие:", {
    reply_markup: {
      keyboard: [["📝 Записаться"], ["🕐 Ближайшие окна", "📋 Мои записи"]],
      resize_keyboard: true
    }
  });
}

function clientBotSlotsKeyboard() {
  const availability = getNearestAvailability(getSheet());
  const rows = availability.slots.map(function(slot) {
    const callback = "client_slot:" + slot.date.replace(/-/g, "") + ":" + slot.time.replace(":", "");
    return [{ text: formatDateForTelegram(slot.date) + " " + slot.time, callback_data: callback }];
  });
  return { slots: availability.slots, keyboard: { inline_keyboard: rows } };
}

function formatDateForTelegram(date) {
  const parts = String(date || "").split("-");
  return parts.length === 3 ? parts[2] + "." + parts[1] : String(date || "");
}

function handleClientTelegramMessage(message, event) {
  if (!checkTelegramWebhookAccess(event)) return { success: false, error: "Webhook access denied" };
  const chatId = String(message && message.chat && message.chat.id || "");
  if (!chatId || String(message.chat.type || "") !== "private") return { success: true };
  const text = String(message.text || "").trim();
  const state = getClientBotState(chatId);

  if (text === "/start" || text === "/menu" || text === "Отмена") {
    clearClientBotState(chatId);
    clientBotMenu(chatId, "Здравствуйте! Я помогу выбрать свободное время и отправлю статус вашей записи.");
    return { success: true };
  }
  if (text === "📝 Записаться" || text === "🕐 Ближайшие окна" || text === "/book" || text === "/slots") {
    sendClientNearestSlots(chatId, text === "📝 Записаться" ? "Выберите удобное время:" : "Ближайшие свободные окна:");
    return { success: true };
  }
  if (text === "📋 Мои записи" || text === "/bookings") {
    sendClientBookings(chatId);
    return { success: true };
  }
  if (state.step === "name") {
    if (!text || text.length > 80) {
      sendClientBotMessage(chatId, "Введите имя — до 80 символов.");
      return { success: true };
    }
    state.name = text;
    state.step = "phone";
    setClientBotState(chatId, state);
    sendClientBotMessage(chatId, "Отправьте номер телефона текстом или кнопкой ниже.", {
      reply_markup: { keyboard: [[{ text: "📱 Отправить номер", request_contact: true }], ["Отмена"]], resize_keyboard: true, one_time_keyboard: true }
    });
    return { success: true };
  }
  if (state.step === "phone") {
    const phone = String(message.contact && message.contact.phone_number || text).trim();
    if (!phone || phone.length < 5 || phone.length > 30) {
      sendClientBotMessage(chatId, "Введите корректный номер телефона.");
      return { success: true };
    }
    createClientTelegramBooking(chatId, message.from || {}, state, phone);
    return { success: true };
  }
  clientBotMenu(chatId, "Выберите действие с помощью кнопок.");
  return { success: true };
}

function handleClientTelegramCallback(callback, event) {
  if (!checkTelegramWebhookAccess(event)) {
    answerTelegramCallback(callback.id, "Не удалось проверить запрос.", true);
    return { success: false, error: "Webhook access denied" };
  }
  if (isTelegramStaff(callback.from, callback.message && callback.message.chat)) {
    answerTelegramCallback(callback.id, "Открываю рабочее меню");
    staffBotMenu(String(callback.message.chat.id));
    return { success: true };
  }
  const chatId = String(callback.message && callback.message.chat && callback.message.chat.id || "");
  const data = String(callback.data || "");
  if (!chatId) return { success: false, error: "Chat not found" };

  if (data === "client_cancel") {
    clearClientBotState(chatId);
    answerTelegramCallback(callback.id, "Запись отменена");
    clientBotMenu(chatId, "Выберите действие:");
    return { success: true };
  }
  if (data === "client_slots") {
    answerTelegramCallback(callback.id, "Загружаю окна…");
    sendClientNearestSlots(chatId, "Ближайшие свободные окна:");
    return { success: true };
  }
  const slotMatch = data.match(/^client_slot:(\d{8}):(\d{4})$/);
  if (slotMatch) {
    const date = slotMatch[1].slice(0, 4) + "-" + slotMatch[1].slice(4, 6) + "-" + slotMatch[1].slice(6, 8);
    const time = slotMatch[2].slice(0, 2) + ":" + slotMatch[2].slice(2, 4);
    const availability = getNearestAvailability(getSheet());
    const available = availability.slots.some(function(slot) { return slot.date === date && slot.time === time; });
    if (!available) {
      answerTelegramCallback(callback.id, "Это окно уже занято.", true);
      sendClientNearestSlots(chatId, "Выберите другое свободное время:");
      return { success: true };
    }
    setClientBotState(chatId, { step: "service", date: date, time: time });
    answerTelegramCallback(callback.id, "Время выбрано");
    sendClientBotMessage(chatId, "Выберите услугу:", {
      reply_markup: { inline_keyboard: CLIENT_BOT_SERVICES.map(function(service, index) {
        return [{ text: service, callback_data: "client_service:" + index }];
      }).concat([[{ text: "Отмена", callback_data: "client_cancel" }]]) }
    });
    return { success: true };
  }
  const serviceMatch = data.match(/^client_service:(\d)$/);
  if (serviceMatch) {
    const state = getClientBotState(chatId);
    const service = CLIENT_BOT_SERVICES[Number(serviceMatch[1])];
    if (!state.date || !state.time || !service) {
      answerTelegramCallback(callback.id, "Начните запись заново.", true);
      clientBotMenu(chatId, "Выберите действие:");
      return { success: true };
    }
    state.service = service;
    state.step = "name";
    setClientBotState(chatId, state);
    answerTelegramCallback(callback.id, "Услуга выбрана");
    sendClientBotMessage(chatId, "Как к вам обращаться?");
    return { success: true };
  }
  answerTelegramCallback(callback.id, "Неизвестная команда.", true);
  return { success: false, error: "Unknown client command" };
}

function sendClientNearestSlots(chatId, title) {
  const result = clientBotSlotsKeyboard();
  if (!result.slots.length) {
    sendClientBotMessage(chatId, "Свободных окон пока нет.");
    return;
  }
  sendClientBotMessage(chatId, title, { reply_markup: result.keyboard });
}

function createClientTelegramBooking(chatId, user, state, phone) {
  const telegram = user && user.username ? "@" + String(user.username) : "";
  const result = createBooking({
    name: state.name,
    phone: phone,
    telegram: telegram,
    service: state.service,
    date: state.date,
    time: state.time,
    comment: "Запись через Telegram"
  }, chatId);
  if (!result.success) {
    clearClientBotState(chatId);
    sendClientBotMessage(chatId, "Не удалось создать запись: " + escapeTelegram(result.error || "попробуйте ещё раз.") + "\n\nВыберите новое время.");
    sendClientNearestSlots(chatId, "Ближайшие свободные окна:");
    return;
  }
  clearClientBotState(chatId);
  sendClientBotMessage(chatId,
    "✅ Заявка принята.\n\n💅 " + escapeTelegram(state.service) + "\n📅 " + formatDateForTelegram(state.date) + " в " + escapeTelegram(state.time) +
    "\n\nМы сообщим здесь, когда мастер подтвердит запись.");
  clientBotMenu(chatId, "Вы можете посмотреть другие свободные окна или свои записи.");
}

function sendClientBookings(chatId) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const rows = getBookings(getSheet()).filter(function(booking) {
    return booking.date >= today && booking.status !== "Отменена" &&
      String(PropertiesService.getScriptProperties().getProperty(BOOKING_CLIENT_CHAT_PREFIX + booking.id) || "") === String(chatId);
  }).sort(function(a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  if (!rows.length) {
    sendClientBotMessage(chatId, "У вас нет будущих записей через бота.");
    return;
  }
  const text = rows.map(function(booking) {
    return "💅 " + escapeTelegram(booking.service) + "\n📅 " + formatDateForTelegram(booking.date) + " в " + escapeTelegram(booking.time) + "\nСтатус: " + escapeTelegram(booking.status);
  }).join("\n\n");
  sendClientBotMessage(chatId, "<b>Ваши записи:</b>\n\n" + text);
}

function sendClientBookingStatus(booking, outcome) {
  const chatId = PropertiesService.getScriptProperties().getProperty(BOOKING_CLIENT_CHAT_PREFIX + booking.id);
  if (!chatId) return;
  const confirmed = outcome === "confirm";
  const text = (confirmed ? "✅ <b>Ваша запись подтверждена</b>" : "❌ <b>Ваша запись отменена</b>") +
    "\n\n💅 " + escapeTelegram(booking.service) +
    "\n📅 " + formatDateForTelegram(booking.date) + " в " + escapeTelegram(booking.time);
  try { sendClientBotMessage(chatId, text); } catch (error) { console.error("Не удалось уведомить клиента: " + error.message); }
}

function sendClientBookingReminders() {
  const timezone = Session.getScriptTimeZone();
  const now = new Date();
  const today = Utilities.formatDate(now, timezone, "yyyy-MM-dd");
  const currentTime = Utilities.formatDate(now, timezone, "HH:mm");
  const currentMinutes = Number(currentTime.slice(0, 2)) * 60 + Number(currentTime.slice(3, 5));
  getBookings(getSheet()).filter(function(booking) {
    if (booking.status !== "Активна" || booking.date !== today) return false;
    const time = String(booking.time || "").slice(0, 5);
    const bookingMinutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const minutesUntilBooking = bookingMinutes - currentMinutes;
    return minutesUntilBooking >= 45 && minutesUntilBooking <= 75;
  }).forEach(function(booking) {
    const properties = PropertiesService.getScriptProperties();
    const chatId = properties.getProperty(BOOKING_CLIENT_CHAT_PREFIX + booking.id);
    const reminderKey = BOOKING_REMINDER_PREFIX + booking.id;
    if (!chatId || properties.getProperty(reminderKey)) return;
    try {
      sendClientBotMessage(chatId, "⏰ <b>Напоминание: запись примерно через час</b>\n\n💅 " + escapeTelegram(booking.service) + "\n📅 Сегодня в " + escapeTelegram(booking.time));
      properties.setProperty(reminderKey, "sent");
    } catch (error) {
      console.error("Не удалось отправить напоминание: " + error.message);
    }
  });
}

function installClientBookingRemindersTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "sendClientBookingReminders") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("sendClientBookingReminders")
    .timeBased()
    .everyMinutes(15)
    .create();
}

function clearTelegramMenuCommands(scope) {
  // Удаляем список команд, включая языковые варианты старого меню.
  ["", "ru", "en"].forEach(function(language) {
    telegramApiCall("deleteMyCommands", { scope: scope, language_code: language });
  });
}

function refreshTelegramChatCommands(chatId) {
  try {
    clearTelegramMenuCommands({ type: "chat", chat_id: String(chatId) });
    telegramApiCall("setChatMenuButton", {
      chat_id: String(chatId), menu_button: { type: "default" }
    }, true);
  } catch (error) {
    console.error("Не удалось обновить команды меню: " + error.message);
  }
}

// Запустить вручную после обновления развёртывания. Сообщения не рассылает.
function configureTelegramMenus() {
  clearTelegramMenuCommands({ type: "default" });
  clearTelegramMenuCommands({ type: "all_private_chats" });
  telegramApiCall("setChatMenuButton", { menu_button: { type: "default" } });
  const properties = PropertiesService.getScriptProperties();
  const staffIds = Array.from(new Set([
    properties.getProperty(ADMIN_TELEGRAM_USER_ID_PROPERTY),
    properties.getProperty(MASTER_TELEGRAM_USER_ID_PROPERTY)
  ].filter(Boolean)));
  const saved = properties.getProperties();
  const clientIds = Object.keys(saved).reduce(function(ids, key) {
    if (key.indexOf(CLIENT_BOT_STATE_PREFIX) === 0) ids.push(key.slice(CLIENT_BOT_STATE_PREFIX.length));
    if (key.indexOf(BOOKING_CLIENT_CHAT_PREFIX) === 0) ids.push(saved[key]);
    return ids;
  }, []);
  Array.from(new Set(staffIds.concat(clientIds))).filter(Boolean).forEach(function(chatId) {
    refreshTelegramChatCommands(chatId);
  });
  return { success: true };
}

function configureClientBotProfile() {
  telegramApiCall("setMyDescription", {
    description: "Онлайн-запись в мастерскую «Багира». Отправьте /start, чтобы выбрать свободное время, услугу и получить уведомления о записи."
  });
  telegramApiCall("setMyShortDescription", {
    short_description: "Для начала записи отправьте /start."
  });
  configureTelegramMenus();
}

// ============================================================
// ЭКРАНИРОВАНИЕ TELEGRAM HTML
// ============================================================

function escapeTelegram(text) {

  return String(
    text || ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    );

}



// ============================================================
// НОРМАЛИЗАЦИЯ ДАТЫ
// ============================================================
//
// Приводит даты Google Sheets к:
// YYYY-MM-DD
//
// Также принимает уже готовую строку.
// ============================================================

function normalizeDate(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return "";

  }


  // Если это объект Date
  if (
    Object.prototype.toString
      .call(value) ===
    "[object Date]"
  ) {

    if (
      isNaN(value.getTime())
    ) {

      return "";

    }


    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );

  }


  const text =
    String(value).trim();


  // Уже YYYY-MM-DD
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {

    return text;

  }


  // DD.MM.YYYY
  let match =
    text.match(
      /^(\d{2})\.(\d{2})\.(\d{4})$/
    );


  if (match) {

    return (
      match[3] +
      "-" +
      match[2] +
      "-" +
      match[1]
    );

  }


  // YYYY/MM/DD
  match =
    text.match(
      /^(\d{4})\/(\d{2})\/(\d{2})$/
    );


  if (match) {

    return (
      match[1] +
      "-" +
      match[2] +
      "-" +
      match[3]
    );

  }


  // Если Google вернул
  // строку вида Date
  const parsed =
    new Date(text);


  if (
    !isNaN(
      parsed.getTime()
    )
  ) {

    return Utilities.formatDate(
      parsed,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );

  }


  return text;

}



// ============================================================
// НОРМАЛИЗАЦИЯ ВРЕМЕНИ
// ============================================================
//
// Приводит время к HH:mm
// ============================================================

function normalizeTime(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return "";

  }


  // Если Google Sheets
  // вернул объект Date
  if (
    Object.prototype.toString
      .call(value) ===
    "[object Date]"
  ) {

    if (
      isNaN(value.getTime())
    ) {

      return "";

    }


    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "HH:mm"
    );

  }


  // Число Google Sheets
  // может означать долю суток
  if (
    typeof value === "number"
  ) {

    const totalMinutes =
      Math.round(
        value * 24 * 60
      );


    const hours =
      Math.floor(
        totalMinutes / 60
      ) % 24;


    const minutes =
      totalMinutes % 60;


    return pad2(hours) +
      ":" +
      pad2(minutes);

  }


  const text =
    String(value).trim();


  // HH:mm
  let match =
    text.match(
      /^(\d{1,2}):(\d{2})/
    );


  if (match) {

    return (
      pad2(
        Number(match[1])
      ) +
      ":" +
      match[2]
    );

  }


  // Если Google вернул
  // строку с датой + временем
  const parsed =
    new Date(text);


  if (
    !isNaN(
      parsed.getTime()
    )
  ) {

    return Utilities.formatDate(
      parsed,
      Session.getScriptTimeZone(),
      "HH:mm"
    );

  }


  return text;

}



// ============================================================
// НОРМАЛИЗАЦИЯ ДАТЫ СОЗДАНИЯ
// ============================================================

function normalizeCreatedAt(value) {

  if (
    !value
  ) {

    return "";

  }


  if (
    Object.prototype.toString
      .call(value) ===
    "[object Date]"
  ) {

    if (
      isNaN(value.getTime())
    ) {

      return "";

    }


    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "dd.MM.yyyy HH:mm:ss"
    );

  }


  return String(value);

}



// ============================================================
// ДОБАВИТЬ 0 ПЕРЕД ЧИСЛОМ
// ============================================================

function pad2(number) {

  return String(
    number
  ).padStart(
    2,
    "0"
  );

}

// ============================================================
// ВЫХОДНЫЕ ДНИ (хранятся в Script Properties)
// ============================================================
function getScheduleSettings() {
  const defaultSlots = Array.from({ length: 9 }, function(_, index) { return String(10 + index).padStart(2, "0") + ":00"; });
  const defaultWeek = Array.from({ length: 7 }, function(_, day) { return { day: day, slots: defaultSlots.slice() }; });
  const defaults = { bookingDays: 20, weeklySchedule: defaultWeek };
  const raw = PropertiesService.getScriptProperties().getProperty("SCHEDULE_SETTINGS");
  if (!raw) return defaults;
  try {
    const saved = JSON.parse(raw) || {};
    let weeklySchedule = defaultWeek;
    if (Array.isArray(saved.weeklySchedule)) {
      const byDay = new Map(saved.weeklySchedule.map(function(item) { return [Number(item.day), item]; }));
      weeklySchedule = defaultWeek.map(function(defaultDay) {
        const item = byDay.get(defaultDay.day) || defaultDay;
        let slots;
        if (Array.isArray(item.slots)) {
          slots = item.slots.map(String).filter(function(time) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(time); });
        } else {
          const count = Math.max(0, Math.min(24, Number.isInteger(Number(item.slotCount)) ? Number(item.slotCount) : 9));
          const startTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(item.startTime || "")) ? String(item.startTime) : "10:00";
          const parts = startTime.split(":").map(Number);
          const start = parts[0] * 60 + parts[1];
          slots = Array.from({ length: count }, function(_, index) {
            const minutes = start + index * 60;
            return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
          }).filter(function(time) { return Number(time.slice(0, 2)) < 24; });
        }
        return {
          day: defaultDay.day,
          slots: Array.from(new Set(slots)).sort()
        };
      });
    } else {
      const weeklyDays = Array.isArray(saved.weeklyDays) ? saved.weeklyDays.map(Number) : [];
      weeklySchedule = defaultWeek.map(function(day) {
        return { day: day.day, slots: weeklyDays.indexOf(day.day) !== -1 ? [] : day.slots };
      });
    }
    return {
      bookingDays: Math.max(1, Math.min(365, parseInt(saved.bookingDays, 10) || defaults.bookingDays)),
      weeklySchedule: weeklySchedule
    };
  } catch (error) {
    return defaults;
  }
}

function getScheduleForDate(date, settings) {
  const value = String(date || "");
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || !parts.every(Number.isFinite)) return null;
  const day = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
  const config = settings || getScheduleSettings();
  return config.weeklySchedule.find(function(item) { return item.day === day; }) || null;
}

function getScheduleTimes(date, settings) {
  const config = getScheduleForDate(date, settings);
  return config && Array.isArray(config.slots) ? config.slots.slice() : [];
}

function isBookingTimeAllowed(time, date) {
  return typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    && isValidBookingDate(date) && getScheduleTimes(date).indexOf(time) !== -1;
}

function getDateAfterDays(days) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd").split("-").map(Number);
  return new Date(Date.UTC(today[0], today[1] - 1, today[2] + days)).toISOString().slice(0, 10);
}

function isValidBookingDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + "T00:00:00Z");
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function isBookingDateAllowed(date) {
  const value = String(date || "");
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  return isValidBookingDate(value) && value >= today && value <= getDateAfterDays(getScheduleSettings().bookingDays);
}

function setScheduleSettings(input) {
  return withBookingLock(function() { return setScheduleSettingsLocked(input); });
}

function setScheduleSettingsLocked(input) {
  if (!input || typeof input !== "object") return { success: false, error: "Некорректные настройки расписания." };
  const bookingDays = Number(input.bookingDays);
  if (!Number.isInteger(bookingDays) || bookingDays < 1 || bookingDays > 365) return { success: false, error: "Период записи должен быть от 1 до 365 дней." };
  if (!Array.isArray(input.weeklySchedule) || input.weeklySchedule.length !== 7) return { success: false, error: "Укажите расписание для каждого дня недели." };
  const seenDays = {};
  const weeklySchedule = input.weeklySchedule.map(function(item) {
    const day = Number(item.day);
    const slots = Array.isArray(item.slots) ? item.slots.map(String) : null;
    if (!Number.isInteger(day) || day < 0 || day > 6 || seenDays[day]) throw new Error("Проверьте дни недели в расписании.");
    seenDays[day] = true;
    if (!slots || slots.length > 24 || slots.some(function(time) { return !/^([01]\d|2[0-3]):[0-5]\d$/.test(time); })) throw new Error("У каждого дня должно быть от 0 до 24 корректных времён слотов.");
    if (new Set(slots).size !== slots.length) throw new Error("Время слотов в пределах одного дня не должно повторяться.");
    return { day: day, slots: slots.sort() };
  }).sort(function(a, b) { return a.day - b.day; });
  const schedule = { bookingDays: bookingDays, weeklySchedule: weeklySchedule };
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const conflicts = getBookings(getSheet()).filter(function(booking) {
    if (booking.status === "Отменена" || String(booking.date || "") < today) return false;
    return !getScheduleTimes(booking.date, schedule).includes(String(booking.time || "").slice(0, 5));
  });
  if (conflicts.length) {
    return { success: false, error: "Настройки конфликтуют с существующими записями: " + conflicts.slice(0, 5).map(function(booking) { return String(booking.date).split("-").reverse().join(".") + (booking.time ? " в " + booking.time : ""); }).join(", ") + ". Сначала перенесите или отмените запись." };
  }
  PropertiesService.getScriptProperties().setProperty("SCHEDULE_SETTINGS", JSON.stringify(schedule));
  return { success: true, scheduleSettings: schedule };
}

function getClosedDays() {
  const raw = PropertiesService.getScriptProperties().getProperty("CLOSED_DAYS");
  if (!raw) return [];
  try {
    const dates = JSON.parse(raw);
    return Array.isArray(dates) ? dates.filter(function(date) { return /^\d{4}-\d{2}-\d{2}$/.test(String(date)); }).sort() : [];
  } catch (error) {
    return [];
  }
}

function isClosedDay(date) {
  const value = String(date || "");
  if (getClosedDays().indexOf(value) !== -1) return true;
  const schedule = getScheduleForDate(value);
  return !schedule || !Array.isArray(schedule.slots) || schedule.slots.length === 0;
}

function isPastBookingTime(date, time) {
  const timezone = Session.getScriptTimeZone();
  const now = new Date();
  const today = Utilities.formatDate(now, timezone, "yyyy-MM-dd");
  if (String(date || "") !== today) return false;
  const currentTime = Utilities.formatDate(now, timezone, "HH:mm");
  return String(time || "").slice(0, 5) <= currentTime;
}

function setClosedDays(dates) {
  if (!Array.isArray(dates)) return { success: false, error: "Некорректный список дат" };
  const normalized = Array.from(new Set(dates.map(String).filter(function(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
  }))).sort();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const previous = getClosedDays();
    const newlyClosed = normalized.filter(function(date) { return previous.indexOf(date) === -1; });
    const conflicts = getBookings(getSheet()).filter(function(booking) {
      return newlyClosed.indexOf(booking.date) !== -1 && booking.status !== "Отменена";
    });
    if (conflicts.length) {
      const details = conflicts.map(function(booking) {
        const date = String(booking.date || "").split("-").reverse().join(".");
        return date + (booking.time ? " в " + booking.time : "") + (booking.name ? " — " + booking.name : "");
      });
      return { success: false, error: "Нельзя установить выходной: на эту дату есть активная запись (" + details.join("; ") + "). Сначала перенесите или отмените запись." };
    }
    PropertiesService.getScriptProperties().setProperty("CLOSED_DAYS", JSON.stringify(normalized));
    return { success: true, closedDays: normalized };
  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}

// All read/check/write operations use the same lock, including row deletion.
function withBookingLock(operation) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return operation();
  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}
