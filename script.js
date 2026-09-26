// ==========================================================
// БАГИРА — SCRIPT.JS
// ==========================================================


// ==========================================================
// GOOGLE APPS SCRIPT
// ==========================================================

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbx5bk4gWQXRvXjFo8METowWbFTQYh_4AjuyW4TGqEBg7FCzL2WLGICpwerhu0iGvt-C/exec";


// ==========================================================
// ЭЛЕМЕНТЫ ФОРМЫ
// ==========================================================

const bookingForm =
  document.getElementById("bookingForm");

const serviceInput =
  document.getElementById("service");

const dateInput =
  document.getElementById("date");

const selectedTimeInput =
  document.getElementById("selectedTime");

const nameInput =
  document.getElementById("name");

const phoneInput =
  document.getElementById("phone");

const telegramInput =
  document.getElementById("telegram");

const commentInput =
  document.getElementById("comment");

const formError =
  document.getElementById("formError");

const dateWarning =
  document.getElementById("dateWarning");

const bookingSuccess =
  document.getElementById("bookingSuccess");

const bookingDetails =
  document.getElementById("bookingDetails");

const newBookingButton =
  document.getElementById("newBooking");

let timeButtons = [];
const timeList = document.getElementById("timeList");
let scheduleSettings = { bookingDays: 20, weeklySchedule: Array.from({ length: 7 }, (_, day) => ({ day, slots: Array.from({ length: 9 }, (_, index) => `${String(10 + index).padStart(2, "0")}:00`) })) };
let bookingDateMin = "";
let bookingDateMax = "";

function scheduleForDate(date, settings = scheduleSettings) {
  if (!date) return null;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (settings.weeklySchedule || []).find(item => Number(item.day) === day) || null;
}

function renderTimeButtons(date = dateInput?.value) {
  if (!timeList) return;
  const schedule = scheduleForDate(date);
  timeList.replaceChildren();
  for (const time of (schedule && Array.isArray(schedule.slots) ? schedule.slots : [])) {
    const button = document.createElement("button");
    button.className = "time-button";
    button.dataset.time = time;
    button.type = "button";
    button.textContent = time;
    timeList.appendChild(button);
  }
  timeButtons = Array.from(timeList.querySelectorAll(".time-button"));
}

function setBookingDateLimit(today) {
  if (!dateInput || !today) return;
  const utcDate = new Date(`${today}T00:00:00Z`);
  utcDate.setUTCDate(utcDate.getUTCDate() + Number(scheduleSettings.bookingDays || 20));
  bookingDateMin = today;
  bookingDateMax = utcDate.toISOString().slice(0, 10);
  dateInput.min = today;
  dateInput.max = bookingDateMax;
  updateDateWarning();
}

function updateDateWarning(date = dateInput?.value) {
  if (!dateWarning) return false;
  const schedule = scheduleForDate(date);
  const outsideHorizon = Boolean(date && bookingDateMax && date > bookingDateMax);
  const oneTimeClosed = closedDayDates.includes(date);
  const weeklyClosed = !schedule || !Array.isArray(schedule.slots) || schedule.slots.length === 0;
  const shouldWarn = outsideHorizon || oneTimeClosed || weeklyClosed;
  dateWarning.textContent = shouldWarn ? CLOSED_DAY_WARNING : "";
  dateWarning.style.display = shouldWarn ? "block" : "none";
  return shouldWarn;
}

renderTimeButtons();

let closedDayDates = [];
const CLOSED_DAY_WARNING = "Мы не работаем в выбранный день или дата выходит за пределы периода записи. Пожалуйста, выберите другую дату.";


// ==========================================================
// ТЕКУЩАЯ ДАТА
// ==========================================================

if (dateInput) {

  const today =
    new Date();

  const year =
    today.getFullYear();

  const month =
    String(
      today.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      today.getDate()
    ).padStart(2, "0");


  const todayString =
    `${year}-${month}-${day}`;


  dateInput.min =
    todayString;


  if (!dateInput.value) {

    dateInput.value =
      todayString;

  }

  setBookingDateLimit(todayString);

}


// ==========================================================
// МАСКА ТЕЛЕФОНА
// +375 (XX) XXX-XX-XX
// ==========================================================

// ==========================================================
// МАСКА ТЕЛЕФОНА
// Пользователь вводит только номер после +375
// ==========================================================

if (phoneInput) {

  phoneInput.value = "+375 ";

  phoneInput.addEventListener(
    "focus",
    function () {

      if (
        phoneInput.value.trim() === ""
      ) {

        phoneInput.value = "+375 ";

      }

    }
  );


  phoneInput.addEventListener(
    "input",
    function () {

      // Берём только цифры

      let digits =
        phoneInput.value.replace(
          /\D/g,
          ""
        );


      // Если в поле остался +375,
      // убираем код страны из цифр

      if (
        digits.startsWith("375")
      ) {

        digits =
          digits.substring(3);

      }


      // Если пользователь случайно начал
      // вводить 8 или 375

      if (
        digits.startsWith("8")
      ) {

        digits =
          digits.substring(1);

      }


      // Максимум 9 цифр:
      // XX XXX-XX-XX

      digits =
        digits.substring(
          0,
          9
        );


      let formatted =
        "+375";


      if (
        digits.length > 0
      ) {

        formatted +=
          " (" +
          digits.substring(
            0,
            2
          );

      }


      if (
        digits.length >= 2
      ) {

        formatted +=
          ")";

      }


      if (
        digits.length > 2
      ) {

        formatted +=
          " " +
          digits.substring(
            2,
            5
          );

      }


      if (
        digits.length > 5
      ) {

        formatted +=
          "-" +
          digits.substring(
            5,
            7
          );

      }


      if (
        digits.length > 7
      ) {

        formatted +=
          "-" +
          digits.substring(
            7,
            9
          );

      }


      phoneInput.value =
        formatted;

    }
  );

}

// ==========================================================
// ПОЛУЧИТЬ ЦИФРЫ ТЕЛЕФОНА
// ==========================================================

function getPhoneDigits() {

  if (!phoneInput) {

    return "";

  }


  const digits =
    phoneInput.value.replace(
      /\D/g,
      ""
    );


  if (
    digits.startsWith("375")
  ) {

    return digits;

  }


  return "375" + digits;

}


// ==========================================================
// ПРОВЕРКА ТЕЛЕФОНА
// ==========================================================

function isValidPhone() {

  const digits =
    getPhoneDigits();


  return (

    digits.length === 12 &&

    digits.startsWith("375")

  );

}


// ==========================================================
// ПОКАЗ ОШИБКИ
// ==========================================================

function showError(message) {

  if (!formError) {

    return;

  }


  formError.textContent =
    message;


  formError.style.display =
    "block";

}


// ==========================================================
// СКРЫТЬ ОШИБКУ
// ==========================================================

function hideError() {

  if (!formError) {

    return;

  }


  formError.textContent =
    "";

  formError.style.display =
    "none";

}


// ==========================================================
// ФОРМАТ ДАТЫ
// ==========================================================

function formatDateForDisplay(
  date
) {

  if (!date) {

    return "";

  }


  const parts =
    date.split("-");


  if (
    parts.length !== 3
  ) {

    return date;

  }


  return (

    parts[2] +
    "." +
    parts[1] +
    "." +
    parts[0]

  );

}


// ==========================================================
// ВЫБОР ВРЕМЕНИ
// ==========================================================

if (timeList) {
  timeList.addEventListener("click", function(event) {
    const button = event.target.closest(".time-button");
    if (!button || button.disabled) return;
    timeButtons.forEach(item => item.classList.remove("selected"));
    button.classList.add("selected");
    if (selectedTimeInput) selectedTimeInput.value = button.dataset.time;
    hideError();
  });
}


// ==========================================================
// ЗАГРУЗКА ЗАНЯТЫХ ВРЕМЁН
// ==========================================================

async function loadBusyTimes() {

  try {

    if (!dateInput) {

      return;

    }


    const response =
      await fetch(
        `${SCRIPT_URL}?date=${encodeURIComponent(dateInput.value)}&t=${Date.now()}`
      );


    if (!response.ok) {

      throw new Error(
        "Ошибка HTTP: " +
        response.status
      );

    }


    const result =
      await response.json();


    if (!result.success) {

      throw new Error(
        result.error ||
        "Ошибка загрузки записей"
      );

    }


    const bookings =
      Array.isArray(
        result.bookings
      )
        ? result.bookings
        : [];


    closedDayDates = Array.isArray(result.closedDays) ? result.closedDays : [];
    if (result.scheduleSettings && typeof result.scheduleSettings === "object") {
      const previousSettings = JSON.stringify(scheduleSettings);
      scheduleSettings = { ...scheduleSettings, ...result.scheduleSettings };
      if (JSON.stringify(scheduleSettings) !== previousSettings) {
        renderTimeButtons(dateInput.value);
        if (selectedTimeInput) selectedTimeInput.value = "";
      }
    }
    setBookingDateLimit(result.today || new Date().toISOString().slice(0, 10));
    const selectedDate = dateInput.value;
    const daySchedule = scheduleForDate(selectedDate);
    const selectedDayIsClosed = updateDateWarning(selectedDate);
    const serverToday = result.today || "";
    const serverTime = result.currentTime || "";
    if (selectedDayIsClosed) {
      if (selectedTimeInput) selectedTimeInput.value = "";
    }

    timeButtons.forEach(
      function (button) {

        const time =
          button.dataset.time;


        const isPast = selectedDate === serverToday && time <= serverTime;
        const isBusy =
          selectedDayIsClosed || isPast || bookings.some(
            function (booking) {

              return (

                booking.date ===
                selectedDate &&

                booking.time ===
                time &&

                booking.status !==
                "Отменена"

              );

            }
          );


        button.disabled =
          isBusy;


        if (isBusy) {

          button.classList.add(
            "busy"
          );

        }

        else {

          button.classList.remove(
            "busy"
          );

        }


        // Если выбранное время стало занятым

        if (
          isBusy &&
          selectedTimeInput &&
          selectedTimeInput.value ===
          time
        ) {

          selectedTimeInput.value =
            "";

          button.classList.remove(
            "selected"
          );

        }

      }
    );

  }

  catch (error) {

    console.error(
      "Ошибка загрузки записей:",
      error
    );

  }

}


// ==========================================================
// БЛИЖАЙШИЕ СВОБОДНЫЕ ЗАПИСИ
// ==========================================================

const availabilityToggle = document.getElementById("availabilityToggle");
const availabilityPanel = document.getElementById("availabilityPanel");
const availabilityClose = document.getElementById("availabilityClose");
const availabilityList = document.getElementById("availabilityList");

function setAvailabilityPanelOpen(open) {
  if (!availabilityPanel || !availabilityToggle) return;
  availabilityPanel.hidden = !open;
  availabilityToggle.setAttribute("aria-expanded", String(open));
  if (open) loadNearestAvailability();
}

async function loadNearestAvailability() {
  if (!availabilityList) return;
  availabilityList.replaceChildren();
  const loading = document.createElement("p");
  loading.textContent = "Загружаем свободное время…";
  availabilityList.appendChild(loading);

  try {
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayResponse = await fetch(`${SCRIPT_URL}?date=${encodeURIComponent(localToday)}&t=${Date.now()}`);
    if (!todayResponse.ok) throw new Error("Не удалось загрузить расписание.");
    const todayResult = await todayResponse.json();
    if (!todayResult.success) throw new Error(todayResult.error || "Не удалось загрузить расписание.");
    if (todayResult.scheduleSettings) scheduleSettings = { ...scheduleSettings, ...todayResult.scheduleSettings };
    closedDayDates = Array.isArray(todayResult.closedDays) ? todayResult.closedDays : closedDayDates;

    const today = todayResult.today || localToday;
    if (today !== localToday) {
      const response = await fetch(`${SCRIPT_URL}?date=${encodeURIComponent(today)}&t=${Date.now()}`);
      if (!response.ok) throw new Error("Не удалось загрузить расписание.");
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Не удалось загрузить расписание.");
      Object.assign(todayResult, data);
      closedDayDates = Array.isArray(data.closedDays) ? data.closedDays : closedDayDates;
      if (data.scheduleSettings) scheduleSettings = { ...scheduleSettings, ...data.scheduleSettings };
    }
    const todayUtc = new Date(`${today}T00:00:00Z`);
    const maxDays = Math.min(365, Math.max(1, Number(scheduleSettings.bookingDays) || 20));
    const slots = [];

    for (let offset = 0; offset <= maxDays && slots.length < 6; offset += 1) {
      const date = new Date(todayUtc);
      date.setUTCDate(date.getUTCDate() + offset);
      const dateString = date.toISOString().slice(0, 10);
      if (closedDayDates.includes(dateString)) continue;

      const result = offset === 0
        ? todayResult
        : await (async () => {
            const response = await fetch(`${SCRIPT_URL}?date=${encodeURIComponent(dateString)}&t=${Date.now()}`);
            if (!response.ok) throw new Error("Не удалось загрузить свободное время.");
            const data = await response.json();
            if (!data.success) throw new Error(data.error || "Не удалось загрузить свободное время.");
            if (data.scheduleSettings) scheduleSettings = { ...scheduleSettings, ...data.scheduleSettings };
            if (Array.isArray(data.closedDays)) closedDayDates = data.closedDays;
            return data;
          })();

      if (closedDayDates.includes(dateString)) continue;
      const day = scheduleForDate(dateString);
      const daySlots = day && Array.isArray(day.slots) ? day.slots : [];
      const bookings = Array.isArray(result.bookings) ? result.bookings : [];
      const currentTime = dateString === today ? (result.currentTime || "") : "";

      for (const time of daySlots) {
        if (dateString === today && time <= currentTime) continue;
        const isBusy = bookings.some(booking =>
          booking.date === dateString &&
          String(booking.time || "").trim().substring(0, 5) === time &&
          booking.status !== "Отменена"
        );
        if (!isBusy) slots.push({ date: dateString, time });
        if (slots.length === 6) break;
      }
    }

    availabilityList.replaceChildren();
    if (!slots.length) {
      const empty = document.createElement("p");
      empty.textContent = "Свободных окон пока нет.";
      availabilityList.appendChild(empty);
      return;
    }

    slots.forEach(slot => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "availability-slot";
      const dateLabel = document.createElement("span");
      dateLabel.textContent = formatDateForDisplay(slot.date);
      const timeLabel = document.createElement("strong");
      timeLabel.textContent = slot.time;
      button.append(dateLabel, timeLabel);
      button.addEventListener("click", async () => {
        dateInput.value = slot.date;
        renderTimeButtons(slot.date);
        timeButtons.forEach(item => {
          item.disabled = true;
          item.classList.add("busy");
        });
        await loadBusyTimes();
        const timeButton = timeButtons.find(item => item.dataset.time === slot.time);
        if (!timeButton || timeButton.disabled) {
          loadNearestAvailability();
          return;
        }
        timeButtons.forEach(item => item.classList.remove("selected"));
        timeButton.classList.add("selected");
        selectedTimeInput.value = slot.time;
        if (bookingSuccess) bookingSuccess.style.display = "none";
        if (bookingForm) bookingForm.style.display = "";
        setAvailabilityPanelOpen(false);
        document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.setTimeout(() => nameInput?.focus({ preventScroll: true }), 450);
      });
      availabilityList.appendChild(button);
    });
  } catch (error) {
    availabilityList.replaceChildren();
    const message = document.createElement("p");
    message.textContent = error.message || "Не удалось загрузить свободное время.";
    availabilityList.appendChild(message);
  }
}

availabilityToggle?.addEventListener("click", () => {
  setAvailabilityPanelOpen(availabilityPanel.hidden);
});
availabilityClose?.addEventListener("click", () => setAvailabilityPanelOpen(false));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && availabilityPanel && !availabilityPanel.hidden) setAvailabilityPanelOpen(false);
});


// ==========================================================
// ИЗМЕНЕНИЕ ДАТЫ
// ==========================================================

if (dateInput) {

  dateInput.addEventListener(
    "change",
    function () {

      renderTimeButtons(dateInput.value);
      const dateBlocked = updateDateWarning(dateInput.value);
      if (dateBlocked) {
        timeButtons.forEach(button => {
          button.disabled = true;
          button.classList.add("busy");
        });
      }
      hideError();

      if (
        selectedTimeInput
      ) {

        selectedTimeInput.value =
          "";

      }


      timeButtons.forEach(
        function (button) {

          button.classList.remove(
            "selected"
          );

        }
      );


      loadBusyTimes();

    }
  );

}


// ==========================================================
// АВТООБНОВЛЕНИЕ ЗАНЯТЫХ ВРЕМЁН
// ==========================================================

loadBusyTimes();


setInterval(
  function () {
    if (document.visibilityState === "visible") loadBusyTimes();
  },
  120000
);

document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "visible") loadBusyTimes();
});


// ==========================================================
// ПРОВЕРКА ВРЕМЕНИ НА СЕГОДНЯ
// ==========================================================

function disablePastTimes() {

  if (
    !dateInput
  ) {

    return;

  }


  const selectedDate =
    dateInput.value;


  const now =
    new Date();


  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");


  const today =
    `${year}-${month}-${day}`;


  timeButtons.forEach(
    function (button) {

      const time =
        button.dataset.time;


      if (
        selectedDate !== today
      ) {

        // Не меняем disabled,
        // если время занято в таблице.

        return;

      }


      const parts =
        time.split(":");


      const hour =
        Number(parts[0]);

      const minute =
        Number(parts[1]);


      const currentMinutes =
        now.getHours() * 60 +
        now.getMinutes();


      const buttonMinutes =
        hour * 60 +
        minute;


      if (
        buttonMinutes <=
        currentMinutes
      ) {

        button.disabled =
          true;

        button.classList.add(
          "past"
        );

      }

    }
  );

}


disablePastTimes();


// ==========================================================
// ПОВТОРНАЯ ПРОВЕРКА ПРОШЕДШИХ ВРЕМЁН
// ==========================================================

setInterval(
  function () {

    disablePastTimes();

  },
  60000
);


// ==========================================================
// ОТПРАВКА ФОРМЫ
// ==========================================================

if (bookingForm) {

  bookingForm.addEventListener(
    "submit",
    async function (event) {

      event.preventDefault();


      hideError();


      // ----------------------------------------------------
      // ПРОВЕРКА УСЛУГИ
      // ----------------------------------------------------

      if (
        !serviceInput ||
        !serviceInput.value
      ) {

        showError(
          "Выберите услугу"
        );

        return;

      }


      // ----------------------------------------------------
      // ПРОВЕРКА ДАТЫ
      // ----------------------------------------------------

      if (
        !dateInput ||
        !dateInput.value
      ) {

        showError(
          "Выберите дату"
        );

        return;

      }

      if (updateDateWarning(dateInput.value)) return;


      // ----------------------------------------------------
      // ПРОВЕРКА ВРЕМЕНИ
      // ----------------------------------------------------

      if (
        !selectedTimeInput ||
        !selectedTimeInput.value
      ) {

        showError(
          "Выберите время"
        );

        return;

      }


      // ----------------------------------------------------
      // ПРОВЕРКА ИМЕНИ
      // ----------------------------------------------------

      if (
        !nameInput ||
        !nameInput.value.trim()
      ) {

        showError(
          "Введите ваше имя"
        );

        return;

      }


      // ----------------------------------------------------
      // ПРОВЕРКА ТЕЛЕФОНА
      // ----------------------------------------------------

      if (
        !isValidPhone()
      ) {

        showError(
          "Введите телефон в формате +375 (XX) XXX-XX-XX"
        );

        return;

      }


      // ----------------------------------------------------
      // ПРОВЕРЯЕМ, НЕ ЗАНЯТО ЛИ ВРЕМЯ
      // ----------------------------------------------------

      try {

        const checkResponse =
          await fetch(
            `${SCRIPT_URL}?date=${encodeURIComponent(dateInput.value)}&t=${Date.now()}`
          );


        if (
          !checkResponse.ok
        ) {

          throw new Error(
            "Не удалось проверить свободное время"
          );

        }


        const checkResult =
          await checkResponse.json();


        if (
          !checkResult.success
        ) {

          throw new Error(
            checkResult.error ||
            "Ошибка проверки записи"
          );

        }

        closedDayDates = Array.isArray(checkResult.closedDays) ? checkResult.closedDays : closedDayDates;
        if (checkResult.scheduleSettings) {
          scheduleSettings = { ...scheduleSettings, ...checkResult.scheduleSettings };
          renderTimeButtons(dateInput.value);
        }
        if (checkResult.today) setBookingDateLimit(checkResult.today);


        const bookings =
          Array.isArray(
            checkResult.bookings
          )
            ? checkResult.bookings
            : [];


        const selectedDate =
          dateInput.value;


        if (updateDateWarning(selectedDate)) {
          await loadBusyTimes();
          return;
        }


        const selectedTime =
          selectedTimeInput.value;

        const currentTime = checkResult.currentTime || "";
        if (selectedDate === checkResult.today && currentTime && selectedTime <= currentTime) {
          showError("Это время уже прошло. Выберите свободное время позже.");
          await loadBusyTimes();
          return;
        }

        const isBusy =
          bookings.some(
            function (booking) {

              return (

                booking.date ===
                selectedDate &&

                booking.time ===
                selectedTime &&

                booking.status !==
                "Отменена"

              );

            }
          );


        if (isBusy) {

          showError(
            "Это время уже занято. Выберите другое."
          );


          await loadBusyTimes();


          return;

        }

      }

      catch (error) {

        console.error(
          "Ошибка проверки времени:",
          error
        );


        showError(
          "Не удалось проверить свободное время. Попробуйте ещё раз."
        );


        return;

      }


      // ====================================================
      // ФОРМИРУЕМ ЗАПИСЬ
      // ====================================================

      const booking = {

        action:
          "createBooking",

        date:
          dateInput.value,

        time:
          selectedTimeInput.value,

        service:
          serviceInput.value,

        name:
          nameInput.value.trim(),

        phone:
          phoneInput.value,

        telegram:
          telegramInput
            ? telegramInput.value.trim()
            : "",

        comment:
          commentInput
            ? commentInput.value.trim()
            : ""

      };


      // ====================================================
      // БЛОКИРУЕМ КНОПКУ
      // ====================================================

      const submitButton =
        bookingForm.querySelector(
          'button[type="submit"]'
        );


      if (submitButton) {

        submitButton.disabled =
          true;

        submitButton.dataset.oldText =
          submitButton.textContent;

        submitButton.textContent =
          "Отправка...";

      }


      // ====================================================
      // ОТПРАВКА В GOOGLE APPS SCRIPT
      // ====================================================

      try {

        await fetch(

          SCRIPT_URL,

          {

            method:
              "POST",

            mode:
              "no-cors",

            headers: {

              "Content-Type":
                "text/plain;charset=utf-8"

            },

            body:
              JSON.stringify(
                booking
              )

          }

        );


        // Даём Apps Script время
        // записать строку и отправить Telegram

        await new Promise(
          function (resolve) {

            setTimeout(
              resolve,
              1000
            );

          }
        );


        // ==================================================
        // ПРОВЕРЯЕМ, ПОЯВИЛАСЬ ЛИ ЗАПИСЬ
        // ==================================================

        const verifyResponse =
          await fetch(
            `${SCRIPT_URL}?date=${encodeURIComponent(booking.date)}&t=${Date.now()}`
          );


        if (
          verifyResponse.ok
        ) {

          const verifyResult =
            await verifyResponse.json();


          if (
            verifyResult.success &&
            Array.isArray(
              verifyResult.bookings
            )
          ) {

            const saved =
              verifyResult.bookings.some(
                function (item) {

                  return (

                    item.date ===
                    booking.date &&

                    item.time ===
                    booking.time

                  );

                }
              );


            if (!saved) {

              console.warn(
                "Запись пока не найдена в таблице"
              );

            }

          }

        }


        // ==================================================
        // ПОКАЗ УСПЕШНОГО СООБЩЕНИЯ
        // ==================================================

        if (
          bookingForm
        ) {

          bookingForm.style.display =
            "none";

        }


        if (
          bookingSuccess
        ) {

          bookingSuccess.style.display =
            "block";

        }


        if (
          bookingDetails
        ) {

          bookingDetails.innerHTML =

            "<strong>Услуга:</strong> " +
            escapeHtml(
              booking.service
            ) +

            "<br>" +

            "<strong>Дата:</strong> " +
            escapeHtml(
              formatDateForDisplay(
                booking.date
              )
            ) +

            "<br>" +

            "<strong>Время:</strong> " +
            escapeHtml(
              booking.time
            ) +

            "<br>" +

            "<strong>Имя:</strong> " +
            escapeHtml(
              booking.name
            );

        }


        // Обновляем свободные времена

        await loadBusyTimes();


      }

      catch (error) {

        console.error(
          "Ошибка отправки записи:",
          error
        );


        showError(
          "Не удалось отправить запись. Попробуйте ещё раз."
        );

      }

      finally {

        if (submitButton) {

          submitButton.disabled =
            false;


          submitButton.textContent =
            submitButton.dataset.oldText ||
            "Записаться";

        }

      }

    }
  );

}


// ==========================================================
// НОВАЯ ЗАПИСЬ
// ==========================================================

if (newBookingButton) {

  newBookingButton.addEventListener(
    "click",
    function () {

      if (
        bookingSuccess
      ) {

        bookingSuccess.style.display =
          "none";

      }


      if (
        bookingForm
      ) {

        bookingForm.reset();

        bookingForm.style.display =
          "";

      }


      if (
        selectedTimeInput
      ) {

        selectedTimeInput.value =
          "";

      }


      timeButtons.forEach(
        function (button) {

          button.classList.remove(
            "selected"
          );

        }
      );


      // Возвращаем сегодняшнюю дату

      if (dateInput) {

        const today =
          new Date();


        const year =
          today.getFullYear();

        const month =
          String(
            today.getMonth() + 1
          ).padStart(2, "0");

        const day =
          String(
            today.getDate()
          ).padStart(2, "0");


        dateInput.value =
          `${year}-${month}-${day}`;

      }


      hideError();


      loadBusyTimes();

      disablePastTimes();

    }
  );

}


// ==========================================================
// HTML ESCAPE
// ==========================================================

function escapeHtml(
  value
) {

  return String(
    value || ""
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
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}


// ==========================================================
// МОБИЛЬНОЕ МЕНЮ
// ==========================================================

const burger =
  document.getElementById(
    "burger"
  );

const nav =
  document.getElementById(
    "nav"
  );


if (
  burger &&
  nav
) {

  burger.addEventListener(
    "click",
    function () {

      nav.classList.toggle(
        "active"
      );

      burger.classList.toggle(
        "active"
      );

    }
  );


  // Закрываем меню после клика

  const navLinks =
    nav.querySelectorAll(
      "a"
    );


  navLinks.forEach(
    function (link) {

      link.addEventListener(
        "click",
        function () {

          nav.classList.remove(
            "active"
          );

          burger.classList.remove(
            "active"
          );

        }
      );

    }
  );

}


// ==========================================================
// ПЛАВНАЯ ПРОКРУТКА
// ==========================================================

document
  .querySelectorAll(
    'a[href^="#"]'
  )
  .forEach(
    function (link) {

      link.addEventListener(
        "click",
        function (event) {

          const href =
            link.getAttribute(
              "href"
            );


          if (
            !href ||
            href === "#"
          ) {

            return;

          }


          const target =
            document.querySelector(
              href
            );


          if (!target) {

            return;

          }


          event.preventDefault();


          target.scrollIntoView({

            behavior:
              "smooth",

            block:
              "start"

          });

        }
      );

    }
  );


// ==========================================================
// ГАЛЕРЕЯ — КАРУСЕЛИ
// ==========================================================

const galleryCarousels =
  document.querySelectorAll(
    ".gallery-carousel"
  );


galleryCarousels.forEach(
  function (carousel) {

    const track =
      carousel.querySelector(
        ".gallery-track"
      );


    const items =
      carousel.querySelectorAll(
        ".gallery-item"
      );


    const prev =
      carousel.querySelector(
        ".gallery-prev"
      );


    const next =
      carousel.querySelector(
        ".gallery-next"
      );


    if (
      !track ||
      !items.length
    ) {

      return;

    }


    let currentIndex =
      0;


    function getVisibleCount() {

      if (
        window.innerWidth <= 768
      ) {

        return 1;

      }


      if (
        window.innerWidth <= 1100
      ) {

        return 3;

      }


      return 4;

    }


    function updateCarousel() {

      const visible =
        getVisibleCount();


      const maxIndex =
        Math.max(
          0,
          items.length - visible
        );


      if (
        currentIndex >
        maxIndex
      ) {

        currentIndex =
          maxIndex;

      }


      if (
        currentIndex < 0
      ) {

        currentIndex =
          0;

      }


      const itemWidth =
        items[0].getBoundingClientRect()
          .width;


      const gap =
        parseFloat(
          getComputedStyle(
            track
          ).gap
        ) || 0;


      const offset =
        currentIndex *
        (itemWidth + gap);


      track.style.transform =
        `translateX(-${offset}px)`;


      if (prev) {

        prev.disabled =
          currentIndex === 0;

      }


      if (next) {

        next.disabled =
          currentIndex >=
          maxIndex;

      }

    }


    if (prev) {

      prev.addEventListener(
        "click",
        function () {

          currentIndex--;

          updateCarousel();

        }
      );

    }


    if (next) {

      next.addEventListener(
        "click",
        function () {

          currentIndex++;

          updateCarousel();

        }
      );

    }


    window.addEventListener(
      "resize",
      updateCarousel
    );


    updateCarousel();

  }
);


/// =========================
// УВЕЛИЧЕНИЕ ФОТО
// =========================

document.querySelectorAll(".gallery-carousel").forEach((carousel) => {

  const images = Array.from(
    carousel.querySelectorAll(".gallery-item img")
  );

  images.forEach((image, index) => {

    image.addEventListener("click", () => {

      let currentIndex = index;

      // Создаём окно
      const overlay = document.createElement("div");
      overlay.className = "image-lightbox";

      overlay.innerHTML = `
        <button class="lightbox-close" type="button">
          &times;
        </button>

        <button class="lightbox-prev" type="button">
          ←
        </button>

        <img
          class="lightbox-image"
          src="${images[currentIndex].src}"
          alt="${images[currentIndex].alt || ""}"
        >

        <button class="lightbox-next" type="button">
          →
        </button>
      `;

      document.body.appendChild(overlay);

      document.body.style.overflow = "hidden";

      const lightboxImage =
        overlay.querySelector(".lightbox-image");

      const prevButton =
        overlay.querySelector(".lightbox-prev");

      const nextButton =
        overlay.querySelector(".lightbox-next");

      const closeButton =
        overlay.querySelector(".lightbox-close");


      // =========================
      // ПОКАЗЫВАЕМ ФОТО
      // =========================

      function showImage() {

        lightboxImage.src =
          images[currentIndex].src;

        lightboxImage.alt =
          images[currentIndex].alt || "";

        // Первая фотография
        prevButton.disabled =
          currentIndex === 0;

        // Последняя фотография
        nextButton.disabled =
          currentIndex === images.length - 1;
      }


      // =========================
      // НАЗАД
      // =========================

      prevButton.addEventListener("click", (event) => {

        event.stopPropagation();

        if (currentIndex > 0) {

          currentIndex--;

          showImage();
        }

      });


      // =========================
      // ВПЕРЁД
      // =========================

      nextButton.addEventListener("click", (event) => {

        event.stopPropagation();

        if (currentIndex < images.length - 1) {

          currentIndex++;

          showImage();
        }

      });


      // =========================
      // ЗАКРЫТИЕ
      // =========================

      function closeLightbox() {

        overlay.remove();

        document.body.style.overflow = "";

        document.removeEventListener(
          "keydown",
          handleKeyboard
        );
      }


      closeButton.addEventListener(
        "click",
        closeLightbox
      );


      // Клик по тёмному фону
      overlay.addEventListener("click", (event) => {

        if (event.target === overlay) {
          closeLightbox();
        }

      });


      // =========================
      // КЛАВИАТУРА
      // =========================

      function handleKeyboard(event) {

        if (event.key === "Escape") {

          closeLightbox();

        } else if (
          event.key === "ArrowLeft" &&
          currentIndex > 0
        ) {

          currentIndex--;

          showImage();

        } else if (
          event.key === "ArrowRight" &&
          currentIndex < images.length - 1
        ) {

          currentIndex++;

          showImage();
        }

      }

      document.addEventListener(
        "keydown",
        handleKeyboard
      );


      // Первый показ
      showImage();

    });

  });

});
// ===============================
// PWA — SERVICE WORKER
// ===============================

if ("serviceWorker" in navigator) {

  window.addEventListener("load", async () => {

    try {

      const registration =
        await navigator.serviceWorker.register(
          "./service-worker.js",
          {
            updateViaCache: "none"
          }
        );

      console.log(
        "PWA: Service Worker зарегистрирован",
        registration
      );




    } catch (error) {

      console.error(
        "PWA: ошибка регистрации Service Worker",
        error
      );

    }

  });


  // ===============================
  // АВТОМАТИЧЕСКАЯ ПЕРЕЗАГРУЗКА
  // ===============================

  let refreshing = false;

  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => {

      if (refreshing) {
        return;
      }

      refreshing = true;

      window.location.reload();

    }
  );

}
/* =========================================
   PWA INSTALL SYSTEM — БАГИРА
   iPhone + Android
========================================= */

document.addEventListener("DOMContentLoaded", () => {

  const overlay =
    document.getElementById("pwaInstallOverlay");

  const closeButton =
    document.getElementById("pwaClose");

  const installButton =
    document.getElementById("pwaInstallButton");

  const laterButton =
    document.getElementById("pwaLaterButton");

  const ios =
    document.getElementById("pwaIOS");

  const iosNotSafari =
    document.getElementById("pwaIOSNotSafari");

  const androidInstall =
    document.getElementById("pwaAndroidInstall");

  const androidManual =
    document.getElementById("pwaAndroidManual");


  if (!overlay) return;


  /* =========================================
     ОПРЕДЕЛЯЕМ УСТРОЙСТВО
  ========================================= */

  const userAgent =
    navigator.userAgent || navigator.vendor || window.opera;


  const isIOS =
    /iPhone|iPad|iPod/i.test(userAgent);


  const isAndroid =
    /Android/i.test(userAgent);


  /* =========================================
     PWA УЖЕ УСТАНОВЛЕНО?
  ========================================= */

  const isStandalone =

    window.matchMedia(
      "(display-mode: standalone)"
    ).matches ||

    window.navigator.standalone === true;


  if (isStandalone) {

    return;

  }


  /* =========================================
     ТОЛЬКО МОБИЛЬНЫЕ
  ========================================= */

  if (!isIOS && !isAndroid) {

    return;

  }


  /* =========================================
     ПРОВЕРЯЕМ "НАПОМИНАНИЕ ПОЗЖЕ"
  ========================================= */

  const hiddenUntil =
    localStorage.getItem(
      "bagiraPwaHiddenUntil"
    );


  if (hiddenUntil) {

    const hiddenTime =
      Number(hiddenUntil);


    if (
      Date.now() < hiddenTime
    ) {

      return;

    }

  }


  /* =========================================
     SAFARI?
  ========================================= */

  const isSafari =

    /^((?!chrome|android|crios|fxios|edgios|opera).)*safari/i
      .test(userAgent);


  /* =========================================
     ANDROID INSTALL PROMPT
  ========================================= */

  let deferredPrompt = null;


  /* =========================================
     ПОЛУЧАЕМ СИСТЕМНОЕ ОКНО УСТАНОВКИ
  ========================================= */

  window.addEventListener(
    "beforeinstallprompt",
    (event) => {

      event.preventDefault();

      deferredPrompt = event;


      /*
       * Если это Android,
       * показываем настоящее
       * предложение установки.
       */

      if (isAndroid) {

        showAndroidInstall();

      }

    }
  );


  /* =========================================
     ПОКАЗ ANDROID
  ========================================= */

  function showAndroidInstall() {

    ios.style.display = "none";

    iosNotSafari.style.display = "none";

    androidManual.style.display = "none";

    androidInstall.style.display = "block";


    installButton.style.display =
      "block";


    installButton.textContent =
      "Установить «Багира»";


    showModal();

  }


  /* =========================================
     ANDROID БЕЗ AUTOMATIC PROMPT
  ========================================= */

  function showAndroidManual() {

    ios.style.display = "none";

    iosNotSafari.style.display = "none";

    androidInstall.style.display =
      "none";

    androidManual.style.display =
      "block";


    installButton.style.display =
      "none";


    showModal();

  }


  /* =========================================
     IOS
  ========================================= */

  if (isIOS) {

    if (isSafari) {

      ios.style.display =
        "block";

      iosNotSafari.style.display =
        "none";

    } else {

      ios.style.display =
        "none";

      iosNotSafari.style.display =
        "block";

    }


    installButton.textContent =
      "Понятно";


    showModal();

  }


  /* =========================================
     ANDROID
  ========================================= */

  if (isAndroid) {

    /*
     * Если beforeinstallprompt
     * ещё не появился,
     * ждём немного.
     */

    setTimeout(() => {

      if (!deferredPrompt) {

        showAndroidManual();

      }

    }, 2500);

  }


  /* =========================================
     ПОКАЗ МОДАЛЬНОГО ОКНА
  ========================================= */

  function showModal() {

    setTimeout(() => {

      overlay.classList.add("active");

    }, 1000);

  }


  /* =========================================
     НАСТОЯЩАЯ УСТАНОВКА ANDROID
  ========================================= */

  installButton.addEventListener(
    "click",
    async () => {

      /*
       * Android
       */

      if (
        isAndroid &&
        deferredPrompt
      ) {

        deferredPrompt.prompt();


        const choice =
          await deferredPrompt.userChoice;


        if (
          choice.outcome ===
          "accepted"
        ) {

          localStorage.removeItem(
            "bagiraPwaHiddenUntil"
          );

        }


        deferredPrompt = null;

        closeModal();

        return;

      }


      /*
       * iPhone
       */

      closeModal();

    }
  );


  /* =========================================
     ЗАКРЫТЬ
  ========================================= */

  closeButton.addEventListener(
    "click",
    closeModal
  );


  /* =========================================
     НАПОМИНАНИЕ ПОЗЖЕ
  ========================================= */

  laterButton.addEventListener(
    "click",
    () => {

      /*
       * 3 дня
       */

      const threeDays =
        3 *
        24 *
        60 *
        60 *
        1000;


      localStorage.setItem(
        "bagiraPwaHiddenUntil",
        Date.now() + threeDays
      );


      closeModal();

    }
  );


  /* =========================================
     КЛИК ПО ФОНУ
  ========================================= */

  overlay.addEventListener(
    "click",
    (event) => {

      if (
        event.target === overlay
      ) {

        closeModal();

      }

    }
  );


  /* =========================================
     ЗАКРЫТИЕ
  ========================================= */

  function closeModal() {

    overlay.classList.remove(
      "active"
    );

  }


  /* =========================================
     ЕСЛИ PWA УСТАНОВИЛОСЬ
  ========================================= */

  window.addEventListener(
    "appinstalled",
    () => {

      localStorage.removeItem(
        "bagiraPwaHiddenUntil"
      );

      closeModal();

    }
  );

});
