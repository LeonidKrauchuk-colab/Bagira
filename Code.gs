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

const TELEGRAM_BOT_TOKEN_PROPERTY =
  "TELEGRAM_BOT_TOKEN";
const TELEGRAM_WEBHOOK_SECRET_PROPERTY = "TELEGRAM_WEBHOOK_SECRET";

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

    // Telegram callback updates share this endpoint with the website API.
    if (data && data.callback_query) {
      return jsonResponse(handleTelegramBookingCallback(data.callback_query, e));
    }
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
    // НАСТРОЙКА ВЫХОДНЫХ ДНЕЙ
    // --------------------------------------------------------
    if (data.action === "setClosedDays") {
      if (!checkGoogleAdminAccess(data.idToken)) {
        return jsonResponse({ success: false, error: "Доступ запрещён" });
      }
      return jsonResponse(setClosedDays(data.dates));
    }

    if (data.action === "setScheduleSettings") {
      if (!checkGoogleAdminAccess(data.idToken)) {
        return jsonResponse({ success: false, error: "Доступ запрещён" });
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

function telegramApiCall(method, payload) {
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
  if (!adminChatId) throw new Error("ADMIN_TELEGRAM_USER_ID не найден");
  if (!masterChatId) throw new Error("MASTER_TELEGRAM_USER_ID не найден");

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
  targets.forEach(function(target) {
    const sent = telegramApiCall("sendMessage", {
      chat_id: target.chatId,
      text: message,
      parse_mode: "HTML",
      reply_markup: keyboard
    });
    if (booking.rowNumber && sent && sent.message_id) {
      getSheet().getRange(booking.rowNumber, target.column).setValue(String(sent.message_id));
    }
  });
}

function handleTelegramBookingCallback(callback, event) {
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
    lock.releaseLock();
  }

  const finalOutcome = booking.status === "Отменена" ? "cancel" : "confirm";
  editTelegramBookingMessages(booking, callback.message, finalOutcome);
  answerTelegramCallback(callback.id, applied
    ? (finalOutcome === "cancel" ? "Заказ отменен" : "Заказ подтвержден")
    : "Заказ уже обработан");
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
        reply_markup: { inline_keyboard: [] }
      });
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
  const deploymentUrl = ScriptApp.getService().getUrl();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не найден");
  if (!deploymentUrl) throw new Error("Сначала разверните проект как веб-приложение");

  let secret = properties.getProperty(TELEGRAM_WEBHOOK_SECRET_PROPERTY);
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    properties.setProperty(TELEGRAM_WEBHOOK_SECRET_PROPERTY, secret);
  }
  const webhookUrl = deploymentUrl + "?telegramSecret=" + encodeURIComponent(secret);
  telegramApiCall("setWebhook", { url: webhookUrl, allowed_updates: ["callback_query"] });
  return { success: true, message: "Telegram webhook установлен." };
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
  return getScheduleTimes(date).indexOf(String(time || "").slice(0, 5)) !== -1;
}

function getDateAfterDays(days) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd").split("-").map(Number);
  return new Date(Date.UTC(today[0], today[1] - 1, today[2] + days)).toISOString().slice(0, 10);
}

function isBookingDateAllowed(date) {
  const value = String(date || "");
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= today && value <= getDateAfterDays(getScheduleSettings().bookingDays);
}

function setScheduleSettings(input) {
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
    lock.releaseLock();
  }
}
