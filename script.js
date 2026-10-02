// ==========================================================
// БАГИРА — SCRIPT.JS
// ==========================================================


// ==========================================================
// GOOGLE APPS SCRIPT
// ==========================================================

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbz7YOsw9YSwHQNqO9MVr0DrLiabp9JSwzVSNidAToAVGnNvi-IAR66Cyx0SexrIjKVZ/exec";


// ==========================================================
// ЭЛЕМЕНТЫ ФОРМЫ
// ==========================================================

let bookingSubmissionBusy = false;
let pendingWebsiteBooking = null;
let busyTimesRequestVersion = 0;

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
  const target = /услугу/i.test(message) ? serviceInput : /имя/i.test(message) ? nameInput : /телефон/i.test(message) ? phoneInput : /дату/i.test(message) ? dateInput : /время/i.test(message) ? timeList : null;
  if (target) {
    const group = target.closest(".form-group");
    let error = group.querySelector(".field-error");
    if (!error) { error = document.createElement("p"); error.className="field-error"; error.id=target.id+"Error"; group.append(error); }
    error.textContent=message;
    target.setAttribute("aria-invalid","true");
    const descriptions=(target.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
    if(!descriptions.includes(error.id)) descriptions.push(error.id);
    target.setAttribute("aria-describedby",descriptions.join(" "));
    if(target===timeList)target.setAttribute("tabindex","-1");
    target.focus();
  }


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
  document.querySelectorAll(".field-error").forEach(item => item.textContent="");
  bookingForm?.querySelectorAll('[aria-invalid="true"]').forEach(item => item.removeAttribute("aria-invalid"));


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
  timeList.addEventListener("click", function (event) {
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
  if(pendingWebsiteBooking) return;
  const requestedDate = dateInput?.value;
  const requestVersion = ++busyTimesRequestVersion;
  try {

    if (!dateInput) {

      return;

    }


    document.getElementById("nearestSuggestion")?.replaceChildren();
    const response =
      await fetch(
        `${SCRIPT_URL}?date=${encodeURIComponent(requestedDate)}&t=${Date.now()}`
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


    if (pendingWebsiteBooking || dateInput.value !== requestedDate || requestVersion !== busyTimesRequestVersion) return;

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
        if (selectedTimeInput && !timeButtons.some(button=>button.dataset.time===selectedTimeInput.value)) selectedTimeInput.value = "";
      }
    }
    setBookingDateLimit(result.today || new Date().toISOString().slice(0, 10));
    const selectedDate = dateInput.value;
    const daySchedule = scheduleForDate(selectedDate);
    const selectedDayIsClosed = updateDateWarning(selectedDate);
    if(selectedDayIsClosed) offerNearestSlot(selectedDate);
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
          button.classList.toggle("selected",selectedTimeInput?.value === time);

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

    if (!selectedDayIsClosed && selectedDate && dateWarning) {
      const noFreeTimes = !Array.from(timeButtons).some(button => !button.disabled);
      dateWarning.textContent = noFreeTimes
        ? "На выбранную дату свободных записей нет. Пожалуйста, выберите другую дату."
        : "";
      dateWarning.style.display = noFreeTimes ? "block" : "none";
      if(noFreeTimes) offerNearestSlot(selectedDate);
    }

  }

  catch (error) {
    if(dateInput?.value !== requestedDate || requestVersion !== busyTimesRequestVersion) return;
    timeButtons.forEach(button => {button.disabled=true;button.classList.remove("selected");});
    if(selectedTimeInput) selectedTimeInput.value="";
    if(dateWarning) {dateWarning.textContent="Не удалось загрузить свободное время. Проверьте подключение и выберите дату ещё раз.";dateWarning.style.display="block";}


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
let availabilityCache = null;
const AVAILABILITY_CACHE_MS = 30 * 1000;

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
    let result = availabilityCache && availabilityCache.expiresAt > Date.now()
      ? availabilityCache.data
      : null;
    if (!result) {
      const response = await fetch(`${SCRIPT_URL}?availability=1&t=${Date.now()}`);
      if (!response.ok) throw new Error("Не удалось загрузить расписание.");
      result = await response.json();
      if (!result.success) throw new Error(result.error || "Не удалось загрузить расписание.");
      availabilityCache = { data: result, expiresAt: Date.now() + AVAILABILITY_CACHE_MS };
    }

    if (result.scheduleSettings) scheduleSettings = { ...scheduleSettings, ...result.scheduleSettings };
    if (Array.isArray(result.closedDays)) closedDayDates = result.closedDays;
    const slots = Array.isArray(result.slots) ? result.slots : [];

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
        if (bookingSuccess) bookingSuccess.style.display = "none";
        if (bookingForm) bookingForm.style.display = "";
        setAvailabilityPanelOpen(false);
        document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (pendingWebsiteBooking) return;
        selectedTimeInput.value = "";
        dateInput.value = slot.date;
        renderTimeButtons(slot.date);
        timeButtons.forEach(item => {
          item.disabled = true;
          item.classList.add("busy");
        });
        await loadBusyTimes();
        if (pendingWebsiteBooking || dateInput.value !== slot.date) return;
        const timeButton = timeButtons.find(item => item.dataset.time === slot.time);
        if (!timeButton || timeButton.disabled) {
          availabilityCache = null;
          loadNearestAvailability();
          return;
        }
        timeButtons.forEach(item => item.classList.remove("selected"));
        timeButton.classList.add("selected");
        selectedTimeInput.value = slot.time;
        window.setTimeout(() => {
          if (!serviceInput) return;
          serviceInput.focus({ preventScroll: true });
          if (typeof serviceInput.showPicker === "function") {
            try {
              serviceInput.showPicker();
              return;
            } catch (error) {
              // В некоторых браузерах список можно открыть только по прямому клику.
            }
          }
          serviceInput.click();
        }, 450);
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

document.addEventListener("visibilitychange", function () {
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
      if (bookingSubmissionBusy) return;
      bookingSubmissionBusy=true;
      bookingForm.setAttribute("aria-busy","true");
      const actionButton=bookingForm.querySelector('button[type="submit"]');
      actionButton.disabled=true;actionButton.textContent="Проверяем время…";
      try {
      hideError();
      if (!pendingWebsiteBooking) {

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

      }
      const booking = pendingWebsiteBooking || {

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


      if (!pendingWebsiteBooking) {
        if (!await reviewBooking(booking)) return;
        booking.requestId=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");
        pendingWebsiteBooking=booking;
        saveWebsiteDraft();
        lockPendingWebsiteBooking(true);
      }

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

        const response = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(booking)
        });
        if (!response.ok) throw new Error("Ошибка отправки записи. Попробуйте ещё раз.");
        const result = await response.json();
        if (result.success !== true || !result.id) {
          if(result.code === "BOOKING_REJECTED") {pendingWebsiteBooking=null;lockPendingWebsiteBooking(false);saveWebsiteDraft();}
          throw new Error(result.error || "Сервер не подтвердил создание записи.");
        }

        pendingWebsiteBooking=null;lockPendingWebsiteBooking(false);clearWebsiteDraft();

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


        if (bookingDetails) {
          const notice = document.createElement("p");
          notice.textContent = "Для подтверждения или переноса записи мы свяжемся с вами по телефону.";
          if (result.telegramLink && /^https:\/\/t\.me\/BagiraMasterBot\?start=booking_[a-f0-9]{32}$/.test(result.telegramLink)) {
            notice.textContent = "Чтобы получать подтверждение, перенос и напоминания в Telegram, нажмите кнопку ниже, затем «Старт» в боте. До подключения мы свяжемся с вами по телефону. Ссылка действует 24 часа; не пересылайте её другим людям.";
            const link = document.createElement("a");
            link.href = result.telegramLink;
            link.className = "main-button";
            link.textContent = "Подключить уведомления в Telegram";
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            bookingDetails.append(notice, link);
          } else {
            bookingDetails.append(notice);
          }
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
          pendingWebsiteBooking ? "Не удалось получить ответ. Нажмите «Проверить отправку»: повторная запись не создастся." : error.message || "Не удалось отправить запись. Попробуйте ещё раз."
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

      } finally {
        bookingSubmissionBusy=false;bookingForm.removeAttribute("aria-busy");
        actionButton.disabled=false;actionButton.textContent=pendingWebsiteBooking ? "Проверить отправку" : "Проверить запись";
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

// Предложение проверяется ещё раз при выборе, поскольку окно мог занять другой клиент.
let nearestSuggestionVersion=0;
async function offerNearestSlot(forDate) {
  const host=document.getElementById("nearestSuggestion");
  if(!host)return;
  const version=++nearestSuggestionVersion;
  if(pendingWebsiteBooking)return;
  try {
    const response=await fetch(`${SCRIPT_URL}?availability=1&t=${Date.now()}`);
    if(!response.ok)return;
    const result=await response.json();
    if(pendingWebsiteBooking || version!==nearestSuggestionVersion || dateInput.value!==forDate || !result.success)return;
    host.replaceChildren();
    const slot=(result.slots || []).find(item=>item.date!==forDate);
    if(!slot) {host.textContent="В периоде записи свободных окон пока нет.";return;}
    const button=document.createElement("button");button.type="button";button.className="nearest-slot-button";
    button.textContent="Ближайшее окно — "+formatDateForDisplay(slot.date)+", "+slot.time;
    button.addEventListener("click",async()=>{
      if(pendingWebsiteBooking)return;
      button.disabled=true;dateInput.value=slot.date;selectedTimeInput.value="";renderTimeButtons(slot.date);
      timeButtons.forEach(item=>item.disabled=true);
      await loadBusyTimes();
      if(dateInput.value!==slot.date)return;
      const available=timeButtons.find(item=>item.dataset.time===slot.time && !item.disabled);
      if(available) {available.click();available.focus();}
      else showError("Это время уже недоступно. Выберите другое.");
    });
    host.append(button);
  } catch(error) { /* Не мешаем вручную выбрать другую дату. */ }
}
function reviewBooking(booking) {
  const dialog=document.getElementById("bookingReview"),details=document.getElementById("bookingReviewDetails");
  details.replaceChildren();
  [["Услуга",booking.service],["Дата",formatDateForDisplay(booking.date)],["Время",booking.time],["Имя",booking.name],["Телефон",booking.phone],["Telegram",booking.telegram || "Не указан — свяжемся по телефону"],["Комментарий",booking.comment || "—"]].forEach(([label,value])=>{
    const row=document.createElement("p"),title=document.createElement("strong");title.textContent=label+": ";row.append(title,document.createTextNode(value));details.append(row);
  });
  return new Promise(resolve=>{
    let confirmed=false;
    const send=()=>{confirmed=true;dialog.close();},edit=()=>dialog.close();
    const finish=()=>{document.getElementById("reviewSend").removeEventListener("click",send);document.getElementById("reviewEdit").removeEventListener("click",edit);resolve(confirmed);};
    document.getElementById("reviewSend").addEventListener("click",send);document.getElementById("reviewEdit").addEventListener("click",edit);dialog.addEventListener("close",finish,{once:true});
    dialog.showModal();document.getElementById("reviewEdit").focus();
  });
}

const WEBSITE_DRAFT_KEY="bagira-booking-draft-v1";
function websiteDraftValues() {
  return Object.fromEntries(["service","date","selectedTime","name","phone","telegram","comment"].map(id=>[id,document.getElementById(id)?.value || ""]));
}
function saveWebsiteDraft() {
  try {localStorage.setItem(WEBSITE_DRAFT_KEY,JSON.stringify({values:websiteDraftValues(),pending:pendingWebsiteBooking,savedAt:Date.now()}));}catch(error){}
}
function clearWebsiteDraft() {try{localStorage.removeItem(WEBSITE_DRAFT_KEY);}catch(error){}}
function lockPendingWebsiteBooking(locked) {
  bookingForm?.querySelectorAll("input,select,textarea").forEach(el=>el.disabled=locked);
  if(locked) bookingForm?.querySelectorAll(".time-button,#bookingCalendar button,.nearest-slot-button").forEach(el=>el.disabled=true);
  else {loadBusyTimes();loadBookingCalendar();}
  const notice=document.getElementById("draftNotice");
  if(notice && !locked)notice.textContent="";
  if(notice && locked)notice.textContent="Проверяем отправленную заявку. Данные сохранены до получения ответа.";
}
function restoreWebsiteDraft() {
  try {
    const saved=JSON.parse(localStorage.getItem(WEBSITE_DRAFT_KEY)||"null");
    if(!saved)return;
    if(!saved.pending && Date.now()-saved.savedAt>86400000){clearWebsiteDraft();return;}
    for(const [id,value] of Object.entries(saved.values||{})) {
      if(["service","date","selectedTime","name","phone","telegram","comment"].includes(id) && typeof value==="string")document.getElementById(id).value=value;
    }
    pendingWebsiteBooking=saved.pending || null;
    if(pendingWebsiteBooking) {
      for(const [id,key] of [["service","service"],["date","date"],["selectedTime","time"],["name","name"],["phone","phone"],["telegram","telegram"],["comment","comment"]])document.getElementById(id).value=pendingWebsiteBooking[key] || "";
    }
    renderTimeButtons(dateInput.value);
    document.getElementById("draftNotice").textContent="Восстановлена незавершённая заявка. Свободность времени проверяется заново.";
    if(pendingWebsiteBooking){lockPendingWebsiteBooking(true);bookingForm.querySelector('[type="submit"]').textContent="Проверить отправку";}
    else loadBusyTimes();
  }catch(error){clearWebsiteDraft();}
}
async function loadBookingCalendar() {
  const host=document.getElementById("bookingCalendar");if(!host)return;
  host.textContent="Загружаем доступные даты…";
  try {
    const response=await fetch(`${SCRIPT_URL}?calendar=1&t=${Date.now()}`),result=await response.json();
    if(!response.ok || !result.success || !Array.isArray(result.days))throw Error();
    host.replaceChildren();
    dateInput.readOnly=true;
    const title=document.createElement("p");title.className="field-help";title.textContent="Выберите свободный день. Недоступные даты неактивны.";host.append(title);
    const months=[...new Set(result.days.map(d=>d.date.slice(0,7)))];let monthIndex=0;
    const nav=document.createElement("div"),grid=document.createElement("div");nav.className="calendar-nav";grid.className="calendar-grid";host.append(nav,grid);
    function render() {
      nav.replaceChildren();grid.replaceChildren();
      const prev=document.createElement("button"),next=document.createElement("button"),label=document.createElement("strong");
      prev.type=next.type="button";prev.textContent="‹";next.textContent="›";prev.setAttribute("aria-label","Предыдущий месяц");next.setAttribute("aria-label","Следующий месяц");
      prev.disabled=monthIndex===0;next.disabled=monthIndex===months.length-1;
      label.textContent=new Date(months[monthIndex]+"-01T12:00:00").toLocaleDateString("ru-RU",{month:"long",year:"numeric"});nav.append(prev,label,next);
      prev.onclick=()=>{monthIndex--;render();};next.onclick=()=>{monthIndex++;render();};
      ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].forEach(day=>{const cell=document.createElement("span");cell.textContent=day;grid.append(cell);});
      const first=months[monthIndex]+"-01",start=new Date(first+"T12:00:00");
      for(let i=0;i<(start.getDay()+6)%7;i++)grid.append(document.createElement("span"));
      const count=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();
      for(let n=1;n<=count;n++) {
        const date=months[monthIndex]+"-"+String(n).padStart(2,"0"),day=result.days.find(d=>d.date===date),button=document.createElement("button");
        button.type="button";button.textContent=String(n);button.disabled=!day?.available || Boolean(pendingWebsiteBooking);button.setAttribute("aria-label",formatDateForDisplay(date)+(day?.available ? " — есть свободное время" : " — недоступно"));button.setAttribute("aria-pressed",String(dateInput.value===date));
        button.onclick=()=>{dateInput.value=date;dateInput.dispatchEvent(new Event("change",{bubbles:true}));render();};grid.append(button);
      }
    }
    const selected=months.indexOf(dateInput.value.slice(0,7));if(selected>=0)monthIndex=selected;render();
  }catch(error){dateInput.readOnly=false;host.textContent="Календарь временно недоступен. Выберите дату в поле выше.";}
}
if(bookingForm) {
  bookingForm.addEventListener("input",saveWebsiteDraft);
  bookingForm.addEventListener("change",saveWebsiteDraft);
  timeList?.addEventListener("click",saveWebsiteDraft);
  restoreWebsiteDraft();loadBookingCalendar();
  newBookingButton?.addEventListener("click",()=>{pendingWebsiteBooking=null;clearWebsiteDraft();document.getElementById("draftNotice").textContent="";loadBookingCalendar();});
}

document.getElementById("clearDraft")?.addEventListener("click",()=>{
  if(pendingWebsiteBooking || bookingSubmissionBusy) {showError("Сначала проверьте отправку заявки, чтобы не создать повторную запись.");return;}
  bookingForm.reset();selectedTimeInput.value="";dateInput.value=bookingDateMin;renderTimeButtons();clearWebsiteDraft();document.getElementById("draftNotice").textContent="Форма очищена.";loadBusyTimes();loadBookingCalendar();
});
