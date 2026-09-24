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
// 8. Уведомление о новой записи в Telegram
//
// Telegram НЕ управляет записями.
// Telegram используется только для уведомлений.
// ============================================================



// ============================================================
// НАСТРОЙКИ
// ============================================================

const SHEET_NAME = "Записи";

const TELEGRAM_BOT_TOKEN_PROPERTY =
  "TELEGRAM_BOT_TOKEN";

// ============================================================
// GOOGLE АВТОРИЗАЦИЯ АДМИН-ПАНЕЛИ
// ============================================================

const GOOGLE_CLIENT_ID =
  "632682836962-e4oni5b7nv5glg536qaufa53794omca3.apps.googleusercontent.com";


// Разрешённые Google-аккаунты.
// У обоих аккаунтов будут ОДИНАКОВЫЕ права.

const ALLOWED_ADMIN_EMAILS = [

  // Владелец
  "leon12439@gmail.com",

  // ПРИМЕР — сюда позже впишем Gmail мастера
  "limkamilajaja@gmail.com"

];

const ADMIN_TELEGRAM_USER_ID_PROPERTY =
  "ADMIN_TELEGRAM_USER_ID";

const MASTER_TELEGRAM_USER_ID_PROPERTY = "MASTER_TELEGRAM_USER_ID";

// ============================================================
// GET
// ============================================================

function doGet(e) {

  try {

    const sheet = getSheet();

    const bookings = getBookings(sheet);
    const closedDays = getClosedDays();
    const timezone = Session.getScriptTimeZone();
    const now = new Date();

    return jsonResponse({
      success: true,
      bookings: bookings,
      closedDays: closedDays,
      schedule: getScheduleConfig(),
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
// --------------------------------------------------------
// ПРОВЕРКА ДОСТУПА АДМИНИСТРАТОРА
// --------------------------------------------------------

if (
  data.action === "checkAdminAccess"
) {

  const allowed =
    checkGoogleAdminAccess(
      data.idToken
    );

  return jsonResponse({

    success: allowed,

    error: allowed
      ? ""
      : "Этот Google-аккаунт не имеет доступа к админ-панели."

  });

}

    // --------------------------------------------------------
    // НАСТРОЙКА ГРАФИКА
    // --------------------------------------------------------
    if (data.action === "setSchedule") {
      if (!checkGoogleAdminAccess(data.idToken)) {
        return jsonResponse({ success: false, error: "Доступ запрещён" });
      }
      return jsonResponse(setScheduleConfig(data.schedule));
    }

    // --------------------------------------------------------
    // ВЫХОДНЫЕ ДНИ
    // --------------------------------------------------------
    if (data.action === "setClosedDays") {
      if (!checkGoogleAdminAccess(data.idToken)) {
        return jsonResponse({ success: false, error: "Доступ запрещён" });
      }
      return jsonResponse(setClosedDays(data.dates));
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

      if (!checkGoogleAdminAccess(data.idToken)) {

        return jsonResponse({
          success: false,
          error: "Доступ запрещён"
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

  if (!checkGoogleAdminAccess(data.idToken)) {

    return jsonResponse({
      success: false,
      error: "Доступ запрещён"
    });

  }

  const sheet = getSheet();

  const bookings = getBookings(sheet);

  return jsonResponse({
    success: true,
    bookings: bookings,
    schedule: getScheduleConfig()
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
        10
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
          normalizeCreatedAt(row[9])

      };

    }
  );

}



// ============================================================
// СОЗДАНИЕ ЗАПИСИ С САЙТА
// ============================================================

function createBooking(data) {

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

    if (isClosedDay(data.date)) {
      return { success: false, error: "На выбранную дату запись не принимается. Пожалуйста, выберите другой день." };
    }

    if (isPastBookingTime(data.date, data.time)) {
      return { success: false, error: "Это время уже прошло. Выберите свободное время позже." };
    }

    if (!isStartAllowedInSchedule(data.date, data.time, data.service, getScheduleConfig())) {
      return { success: false, error: "Выбранное время не входит в актуальный график работы." };
    }

    // --------------------------------------------------------
    // Проверяем занятость
    // --------------------------------------------------------

    const alreadyBooked = isTimeBusy(
      data.date,
      data.time,
      null,
      data.service
    );

    if (alreadyBooked) {
      return {
        success: false,
        error: "Это время пересекается с другой записью"
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

      "Активна",

      createdAt

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
        10
      )
      .setValues([
        row
      ]);


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
          data.comment

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

    lock.releaseLock();

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
    if (!isStartAllowedInSchedule(data.date, data.time, data.service, getScheduleConfig())) {
      return { success: false, error: "Выбранное время не входит в актуальный график работы." };
    }

    if (
      isTimeBusy(
        data.date,
        data.time,
        null,
        data.service
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

      createdAt

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
        10
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

    lock.releaseLock();

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


  if (newDate !== booking.date && isClosedDay(newDate)) {
    return { success: false, error: "Выбранный день отмечен как выходной" };
  }

  const newService = data.service !== undefined ? data.service : booking.service;
  if (!isStartAllowedInSchedule(newDate, newTime, newService, getScheduleConfig())) {
    return { success: false, error: "Выбранное время не входит в актуальный график работы." };
  }

  if (
    isTimeBusy(
      newDate,
      newTime,
      data.id,
      newService
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
        10
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
          i + 2

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

function isTimeBusy(date, time, excludeId, service) {
  const targetDate = normalizeDate(date);
  const config = getScheduleConfig();
  const requestedStart = timeToMinutes(normalizeTime(time));
  if (requestedStart < 0) return true;
  const requestedEnd = requestedStart + getServiceDuration(service, config);
  const bookings = getBookings(getSheet());

  return bookings.some(function(booking) {
    if (booking.status === "Отменена") return false;
    if (excludeId && String(booking.id) === String(excludeId)) return false;
    if (booking.date !== targetDate) return false;

    const bookedStart = timeToMinutes(normalizeTime(booking.time));
    if (bookedStart < 0) return false;
    const bookedEnd = bookedStart + getServiceDuration(booking.service, config);
    return requestedStart < bookedEnd && bookedStart < requestedEnd;
  });
}

// ============================================================
// ПРОВЕРКА ADMIN API TOKEN
// ============================================================

// ============================================================
// ПРОВЕРКА GOOGLE ID TOKEN
// ============================================================

function checkGoogleAdminAccess(idToken) {

  try {

    // Нет токена
    if (!idToken) {

      console.error(
        "Google ID token отсутствует"
      );

      return false;

    }


    // --------------------------------------------------------
    // Проверяем токен через Google
    // --------------------------------------------------------

    const url =
      "https://oauth2.googleapis.com/tokeninfo?id_token=" +
      encodeURIComponent(idToken);


    const response =
      UrlFetchApp.fetch(
        url,
        {
          method: "get",
          muteHttpExceptions: true
        }
      );


    if (
      response.getResponseCode() !== 200
    ) {

      console.error(
        "Google tokeninfo error: " +
        response.getContentText()
      );

      return false;

    }


    const tokenInfo =
      JSON.parse(
        response.getContentText()
      );


    // --------------------------------------------------------
    // Проверяем Client ID
    // --------------------------------------------------------

    if (
      String(tokenInfo.aud || "") !==
      String(GOOGLE_CLIENT_ID)
    ) {

      console.error(
        "Неверный Google Client ID"
      );

      return false;

    }


    // --------------------------------------------------------
    // Проверяем email
    // --------------------------------------------------------

    const email =
      String(
        tokenInfo.email || ""
      )
        .trim()
        .toLowerCase();


    if (!email) {

      console.error(
        "Google email отсутствует"
      );

      return false;

    }


    // --------------------------------------------------------
    // Проверяем подтверждение email
    // --------------------------------------------------------

    if (
      String(
        tokenInfo.email_verified || ""
      ).toLowerCase() !== "true"
    ) {

      console.error(
        "Google email не подтверждён"
      );

      return false;

    }


    // --------------------------------------------------------
    // Проверяем разрешённый список
    // --------------------------------------------------------

    const allowedEmails =
      ALLOWED_ADMIN_EMAILS.map(
        function(item) {

          return String(item)
            .trim()
            .toLowerCase();

        }
      );


    if (
      allowedEmails.indexOf(email) === -1
    ) {

      console.error(
        "Доступ запрещён для: " +
        email
      );

      return false;

    }


    // --------------------------------------------------------
    // Всё хорошо
    // --------------------------------------------------------

    console.log(
      "Google admin access granted: " +
      email
    );

    return true;


  } catch (error) {

    console.error(
      "Ошибка проверки Google ID token: " +
      error.message
    );

    return false;

  }

}



// ============================================================
// ЕЖЕДНЕВНАЯ СВОДКА ЗАПИСЕЙ
// ============================================================

function sendDailyBookingsSummary() {
  const timezone = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
  const bookings = getBookings(getSheet())
    .filter(function(booking) {
      return booking.date === today && booking.status !== "Отменена";
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
    sendTelegramMessage(url, chatId, message);
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
// TELEGRAM
// Только уведомление о новой записи
// ============================================================

function sendNewBookingTelegram(booking) {

  if (!booking) {

    throw new Error(
      "Нет данных записи"
    );

  }


  const token =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        TELEGRAM_BOT_TOKEN_PROPERTY
      );


  const adminChatId =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        ADMIN_TELEGRAM_USER_ID_PROPERTY
      );


  const masterChatId =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        MASTER_TELEGRAM_USER_ID_PROPERTY
      );


  if (!token) {

    throw new Error(
      "TELEGRAM_BOT_TOKEN не найден"
    );

  }


  if (!adminChatId) {

    throw new Error(
      "ADMIN_TELEGRAM_USER_ID не найден"
    );

  }


  if (!masterChatId) {

    throw new Error(
      "MASTER_TELEGRAM_USER_ID не найден"
    );

  }


  const message =

    "🔔 <b>НОВАЯ ЗАПИСЬ</b>\n\n" +

    "👤 <b>Имя:</b> " +
    escapeTelegram(
      booking.name
    ) +
    "\n" +

    "📞 <b>Телефон:</b> " +
    escapeTelegram(
      booking.phone
    ) +
    "\n" +

    "💬 <b>Telegram:</b> " +
    escapeTelegram(
      booking.telegram || "—"
    ) +
    "\n" +

    "💅 <b>Услуга:</b> " +
    escapeTelegram(
      booking.service
    ) +
    "\n" +

    "📅 <b>Дата:</b> " +
    escapeTelegram(
      booking.date
    ) +
    "\n" +

    "🕐 <b>Время:</b> " +
    escapeTelegram(
      booking.time
    ) +
    "\n" +

    "📝 <b>Комментарий:</b> " +
    escapeTelegram(
      booking.comment || "—"
    );


  const url =
    "https://api.telegram.org/bot" +
    token +
    "/sendMessage";


  // =========================
  // ОТПРАВКА АДМИНИСТРАТОРУ
  // =========================

  sendTelegramMessage(
    url,
    adminChatId,
    message
  );


  // =========================
  // ОТПРАВКА МАСТЕРУ
  // =========================

  sendTelegramMessage(
    url,
    masterChatId,
    message
  );

}
//---------------------
function sendTelegramMessage(
  url,
  chatId,
  message
) {

  const payload = {

    chat_id:
      chatId,

    text:
      message,

    parse_mode:
      "HTML"

  };


  const response =
    UrlFetchApp.fetch(
      url,
      {

        method:
          "post",

        contentType:
          "application/json",

        payload:
          JSON.stringify(payload),

        muteHttpExceptions:
          true

      }
    );


  const result =
    response.getContentText();


  console.log(
    "TELEGRAM RESPONSE: " +
    result
  );


  let telegramResult;


  try {

    telegramResult =
      JSON.parse(result);

  } catch (error) {

    throw new Error(
      "Telegram вернул некорректный ответ: " +
      result
    );

  }


  if (
    !telegramResult.ok
  ) {

    throw new Error(
      "Telegram error: " +
      result
    );

  }

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
// НАСТРОЙКИ ГРАФИКА И ДЛИТЕЛЬНОСТИ ПРОЦЕДУР
// ============================================================

function getDefaultScheduleConfig() {
  return {
    startTime: "10:00",
    endTime: "19:00",
    intervalMinutes: 60,
    serviceDurations: {
      "Маникюр": 60,
      "Педикюр": 60,
      "Депиляция": 60
    }
  };
}

function getScheduleConfig() {
  const raw = PropertiesService.getScriptProperties().getProperty("SCHEDULE_CONFIG");
  const defaults = getDefaultScheduleConfig();
  if (!raw) return defaults;
  try {
    const saved = JSON.parse(raw);
    return {
      startTime: isValidTimeString(saved.startTime) ? saved.startTime : defaults.startTime,
      endTime: isValidTimeString(saved.endTime) ? saved.endTime : defaults.endTime,
      intervalMinutes: [15, 30, 45, 60].indexOf(Number(saved.intervalMinutes)) !== -1 ? Number(saved.intervalMinutes) : defaults.intervalMinutes,
      serviceDurations: Object.assign({}, defaults.serviceDurations, saved.serviceDurations || {})
    };
  } catch (error) {
    return defaults;
  }
}

function setScheduleConfig(schedule) {
  if (!schedule || !isValidTimeString(schedule.startTime) || !isValidTimeString(schedule.endTime)) {
    return { success: false, error: "Укажите корректное время начала и окончания рабочего дня." };
  }
  const start = timeToMinutes(schedule.startTime);
  const end = timeToMinutes(schedule.endTime);
  const interval = Number(schedule.intervalMinutes);
  if (end <= start) return { success: false, error: "Время окончания должно быть позже времени начала." };
  if ([15, 30, 45, 60].indexOf(interval) === -1) return { success: false, error: "Выберите шаг записи 15, 30, 45 или 60 минут." };

  const defaults = getDefaultScheduleConfig();
  const durations = {};
  Object.keys(defaults.serviceDurations).forEach(function(service) {
    const duration = Number(schedule.serviceDurations && schedule.serviceDurations[service]);
    if (!Number.isInteger(duration) || duration < 15 || duration > 360 || duration % 15 !== 0) {
      throw new Error("Длительность «" + service + "» должна быть от 15 до 360 минут, кратной 15.");
    }
    durations[service] = duration;
  });
  const normalized = {
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    intervalMinutes: interval,
    serviceDurations: durations
  };
  Object.keys(durations).forEach(function(service) {
    if (durations[service] > end - start) {
      throw new Error("Рабочий день короче длительности процедуры «" + service + "».");
    }
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const timezone = Session.getScriptTimeZone();
    const today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
    const futureBookings = getBookings(getSheet()).filter(function(booking) {
      return booking.status !== "Отменена" && booking.date >= today;
    });
    const invalidBookings = futureBookings.filter(function(booking) {
      return !isStartAllowedInSchedule(booking.date, booking.time, booking.service, normalized);
    });
    for (let i = 0; i < futureBookings.length; i++) {
      for (let j = i + 1; j < futureBookings.length; j++) {
        const first = futureBookings[i];
        const second = futureBookings[j];
        if (first.date !== second.date) continue;
        const firstStart = timeToMinutes(normalizeTime(first.time));
        const secondStart = timeToMinutes(normalizeTime(second.time));
        const firstEnd = firstStart + getServiceDuration(first.service, normalized);
        const secondEnd = secondStart + getServiceDuration(second.service, normalized);
        if (firstStart < secondEnd && secondStart < firstEnd) {
          if (invalidBookings.indexOf(first) === -1) invalidBookings.push(first);
          if (invalidBookings.indexOf(second) === -1) invalidBookings.push(second);
        }
      }
    }
    if (invalidBookings.length) {
      const details = invalidBookings.map(function(booking) {
        return booking.date.split("-").reverse().join(".") + " в " + booking.time + " (" + booking.service + ")";
      });
      return { success: false, error: "Изменение графика конфликтует с записями: " + details.join(", ") + ". Перенесите их или скорректируйте длительность." };
    }
    PropertiesService.getScriptProperties().setProperty("SCHEDULE_CONFIG", JSON.stringify(normalized));
    return { success: true, schedule: normalized };
  } finally {
    lock.releaseLock();
  }
}

function isValidTimeString(value) {
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(String(value || ""));
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
}

function isStartAllowedInSchedule(date, time, service, config) {
  const start = timeToMinutes(normalizeTime(time));
  const workStart = timeToMinutes(config.startTime);
  const workEnd = timeToMinutes(config.endTime);
  if (start < workStart || start < 0) return false;
  if ((start - workStart) % config.intervalMinutes !== 0) return false;
  return start + getServiceDuration(service, config) <= workEnd;
}

function getServiceDuration(service, config) {
  const minutes = Number(config.serviceDurations && config.serviceDurations[service]);
  return Number.isInteger(minutes) && minutes > 0 ? minutes : config.intervalMinutes;
}

// ============================================================
// ВЫХОДНЫЕ ДНИ (хранятся в Script Properties)
// ============================================================
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
  return getClosedDays().indexOf(String(date || "")) !== -1;
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
    const newlyClosed = normalized.filter(function(date) {
      return previous.indexOf(date) === -1;
    });
    const conflicts = getBookings(getSheet()).filter(function(booking) {
      return newlyClosed.indexOf(booking.date) !== -1 && booking.status !== "Отменена";
    });
    if (conflicts.length) {
      const details = conflicts.map(function(booking) {
        const date = String(booking.date || "").split("-").reverse().join(".");
        return date + (booking.time ? " в " + booking.time : "") + (booking.name ? " — " + booking.name : "");
      });
      return {
        success: false,
        error: "Нельзя установить выходной: на эту дату есть активная запись (" + details.join("; ") + "). Сначала перенесите или отмените запись."
      };
    }
    PropertiesService.getScriptProperties().setProperty("CLOSED_DAYS", JSON.stringify(normalized));
    return { success: true, closedDays: normalized };
  } finally {
    lock.releaseLock();
  }
}
